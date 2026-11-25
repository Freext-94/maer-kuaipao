package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.entity.LedgerAllocation;
import com.example.paotui.entity.LedgerEntry;
import com.example.paotui.enums.LedgerType;
import com.example.paotui.mapper.LedgerAllocationMapper;
import com.example.paotui.mapper.LedgerEntryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 欠款台账唯一写入口。
 *
 * 规则只有三条：
 * 1. 金额变化只能新增流水，永不 UPDATE/DELETE（数据库层也有触发器兜底）；
 * 2. 余额 = Σ流水，不存字段，所以不存在"余额和流水不一致"这类 bug；
 * 3. 核销关系（哪笔付款冲了哪张单）是派生数据，每次写完重算，可反复推导。
 */
@Service
@RequiredArgsConstructor
public class LedgerService {

    private final LedgerEntryMapper entryMapper;
    private final LedgerAllocationMapper allocMapper;

    /** 挂账为正（客户欠我们），收款/减免/退款为负。 */
    @Transactional
    public LedgerEntry post(long customerId, Long orderId, LedgerType type, long amountFen,
                            String method, String note, String operator, String idemKey, Long evidenceId) {
        if (amountFen == 0) {
            throw new BizException("金额不能为 0");
        }
        if (note == null || note.isBlank()) {
            throw new BizException("每一笔流水都必须写备注，否则月底对账无从解释");
        }
        LocalDateTime now = LocalDateTime.now();
        if (idemKey != null && !idemKey.isBlank()) {
            LedgerEntry exist = entryMapper.selectOne(
                    Wrappers.<LedgerEntry>lambdaQuery().eq(LedgerEntry::getIdempotencyKey, idemKey));
            if (exist != null) {
                return exist;
            }
        }
        LedgerEntry e = new LedgerEntry();
        e.setCustomerId(customerId);
        e.setOrderId(orderId);
        e.setType(type.name());
        e.setAmountFen(amountFen);
        e.setReversalOfId(0L);
        e.setOccurredAt(now);
        e.setPeriodMonth(YearMonth.from(now).toString());
        e.setMethod(method == null ? "" : method);
        e.setNote(note);
        e.setOperator(operator == null ? "" : operator);
        e.setEvidenceAttachmentId(evidenceId == null ? 0L : evidenceId);
        e.setIdempotencyKey(idemKey == null || idemKey.isBlank() ? null : idemKey);
        e.setCreator(operator);
        try {
            entryMapper.insert(e);
        } catch (DuplicateKeyException dup) {
            // 并发下同一幂等键只允许落一条，后来者直接复用已有流水
            LedgerEntry existed = entryMapper.selectOne(
                    Wrappers.<LedgerEntry>lambdaQuery().eq(LedgerEntry::getIdempotencyKey, idemKey));
            if (existed == null) {
                throw dup;
            }
            reallocate(customerId);
            return existed;
        }
        reallocate(customerId);
        return e;
    }

    /** 客户自助还款：记一笔收款流水（金额填正数）。 */
    public LedgerEntry repay(long customerId, long amountFen, String method, String idemKey) {
        if (amountFen <= 0) {
            throw new BizException("还款金额必须大于 0");
        }
        return post(customerId, null, LedgerType.PAYMENT, -amountFen,
                method == null ? "" : method, "客户自助还款", "客户", idemKey, null);
    }

    public long balance(long customerId) {
        Long sum = entryMapper.sumBalance(customerId);
        return sum == null ? 0L : sum;
    }

    public List<LedgerEntry> entriesOf(long customerId) {
        return entryMapper.listOrderedByTime(customerId);
    }

    /** 该单已被核销了多少（付款流水分摊到这张单挂账上的金额）。 */
    public long paidOnOrder(long orderId) {
        return allocMapper.sumAllocatedOnOrder(orderId);
    }

    /** 该单挂账类流水合计，应等于 OrderService 重算出来的应收。 */
    public long chargedOnOrder(long orderId) {
        return entryMapper.selectList(Wrappers.<LedgerEntry>lambdaQuery()
                        .eq(LedgerEntry::getOrderId, orderId)
                        .ne(LedgerEntry::getType, LedgerType.PAYMENT.name()))
                .stream().mapToLong(LedgerEntry::getAmountFen).sum();
    }

    /** 只算原始挂账（CHARGE）的合计，不含冲正/减免；核销永远不该超过它。 */
    public long chargedGrossOnOrder(long orderId) {
        return entryMapper.selectList(Wrappers.<LedgerEntry>lambdaQuery()
                        .eq(LedgerEntry::getOrderId, orderId)
                        .eq(LedgerEntry::getType, LedgerType.CHARGE.name()))
                .stream().mapToLong(LedgerEntry::getAmountFen).sum();
    }

    /** 冲正与减免之和（带符号），用来在货款锁定之后修正应收。 */
    public long adjustmentsOf(long orderId) {
        return entryMapper.selectList(Wrappers.<LedgerEntry>lambdaQuery()
                        .eq(LedgerEntry::getOrderId, orderId)
                        .in(LedgerEntry::getType, LedgerType.ADJUST.name(), LedgerType.WAIVE.name()))
                .stream().mapToLong(LedgerEntry::getAmountFen).sum();
    }

    /** 未收齐的挂账单笔，按发生时间从老到新。一次取回核销汇总，不逐条查。 */
    public List<OpenCharge> openCharges(long customerId) {
        Map<Long, Long> usedByEntry = new HashMap<>();
        for (Map<String, Object> row : allocMapper.sumAllocatedGroupedByCharged(customerId)) {
            usedByEntry.put(((Number) row.get("entryId")).longValue(),
                    ((Number) row.get("usedFen")).longValue());
        }
        List<OpenCharge> out = new ArrayList<>();
        for (LedgerEntry e : entriesOf(customerId)) {
            if (typeOf(e) == LedgerType.PAYMENT || e.getAmountFen() <= 0) {
                continue;
            }
            long open = e.getAmountFen() - usedByEntry.getOrDefault(e.getId(), 0L);
            if (open > 0) {
                out.add(new OpenCharge(e, open));
            }
        }
        return out;
    }

    public long prepaidOf(long customerId) {
        return nz(allocMapper.sumPrepaidByCustomer(customerId));
    }

    /**
     * 全量重算核销关系。正常操作都会自动重算，这个入口只给两种场景用：
     * 手工补过流水之后，或怀疑分配表和流水对不上时。
     */
    @Transactional
    public int reallocateAll() {
        List<Long> ids = entryMapper.selectDistinctCustomerIds();
        ids.forEach(this::reallocate);
        return ids.size();
    }

    /** 恒等式自检用的账目快照，给 /health 和对账单页复用。 */
    public long allocatedOf(long customerId) {
        return nz(allocMapper.sumAllocatedOfCustomer(customerId));
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }

    /**
     * 重算该客户的核销关系：付款先冲本单挂账，再按时间冲最老的挂账，剩下转预收。
     * 分配表是派生数据，所以整段删掉重建，逻辑与原型 store.js 完全一致。
     */
    @Transactional
    public void reallocate(long customerId) {
        allocMapper.deleteForCustomer(customerId);
        List<Open> opens = new ArrayList<>();
        for (LedgerEntry e : entriesOf(customerId)) {
            LedgerType type = typeOf(e);
            if (type == LedgerType.PAYMENT) {
                long pay = -e.getAmountFen();
                pay = consume(opens, e, pay, o -> o.orderId != null && o.orderId.equals(e.getOrderId()));
                pay = consume(opens, e, pay, o -> true);
                if (pay > 0) {
                    insert(e.getId(), null, null, pay, e.getOccurredAt(), true);
                }
                continue;
            }
            if (e.getAmountFen() > 0) {
                opens.add(new Open(e.getId(), e.getOrderId(), e.getAmountFen(), e.getOccurredAt()));
            }
        }
    }

    /**
     * 流水类型必须是枚举名原样（大写）。手写 SQL 或导入数据把大小写写错时，
     * MySQL 查询看不出来、Java 判断会静默把"收款"当成"挂账"，那是会算错钱的，
     * 所以这里宁可炸掉也不猜。
     */
    private static LedgerType typeOf(LedgerEntry e) {
        try {
            return LedgerType.valueOf(e.getType());
        } catch (IllegalArgumentException ex) {
            throw new BizException("流水 " + e.getId() + " 的类型「" + e.getType()
                    + "」不是合法值，必须是 " + java.util.Arrays.toString(LedgerType.values()));
        }
    }

    private long consume(List<Open> opens, LedgerEntry payment, long pay, java.util.function.Predicate<Open> accept) {
        for (Open o : opens) {
            if (pay <= 0) {
                break;
            }
            if (o.remain <= 0 || o.occurredAt.isAfter(payment.getOccurredAt()) || !accept.test(o)) {
                continue;
            }
            long use = Math.min(o.remain, pay);
            o.remain -= use;
            pay -= use;
            insert(payment.getId(), o.entryId, o.orderId, use, payment.getOccurredAt(), false);
        }
        return pay;
    }

    private void insert(Long paymentId, Long chargedId, Long orderId, long fen, LocalDateTime at, boolean prepaid) {
        LedgerAllocation a = new LedgerAllocation();
        a.setPaymentEntryId(paymentId);
        a.setChargedEntryId(chargedId);
        a.setOrderId(orderId);
        a.setAllocatedFen(fen);
        a.setOccurredAt(at);
        a.setPrepaid(prepaid ? 1 : 0);
        allocMapper.insert(a);
    }

    private static final class Open {
        long entryId;
        Long orderId;
        long remain;
        LocalDateTime occurredAt;

        Open(long entryId, Long orderId, long remain, LocalDateTime occurredAt) {
            this.entryId = entryId;
            this.orderId = orderId;
            this.remain = remain;
            this.occurredAt = occurredAt;
        }
    }

    public record OpenCharge(LedgerEntry entry, long openFen) {
    }
}
