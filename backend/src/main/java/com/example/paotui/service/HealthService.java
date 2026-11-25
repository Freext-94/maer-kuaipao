package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.LedgerEntry;
import com.example.paotui.entity.Order;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.LedgerEntryMapper;
import com.example.paotui.mapper.OrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 账目自检。前端每次刷新都会带上结果：正常时是一行绿字，异常时必须当场看见，
 * 不能等到月底对不上再查。
 */
@Service
@RequiredArgsConstructor
public class HealthService {

    private final OrderMapper orderMapper;
    private final CustomerMapper customerMapper;
    private final LedgerEntryMapper entryMapper;
    private final OrderService orders;
    private final LedgerService ledger;

    /**
     * 只扫近 90 天。这个检查在每次页面刷新时都跑，全表扫描会随着年份增长变成慢查询，
     * 而陈年账目一旦结清就不会再变，重复核对没有意义。
     */
    private static final int WINDOW_DAYS = 90;

    public List<String> issues() {
        List<String> out = new ArrayList<>();
        LocalDateTime since = LocalDateTime.now().minusDays(WINDOW_DAYS);
        for (Order o : orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getStatus, OrderStatus.FINISHED.name())
                .ge(Order::getCreateTime, since))) {
            long recv = orders.receivable(o);
            long posted = ledger.chargedOnOrder(o.getId());
            if (posted != recv) {
                out.add(o.getOrderNo() + "：挂账类流水合计 " + posted + " 与重算应收 " + recv + " 不一致");
            }
            // 只比原始挂账：冲正/减免会让应收变小，先收钱后让价时"已收 > 应收"是正常的预收，
            // 不是账错；真正的不变式是核销不能超过当初挂出去的钱。
            long paid = ledger.paidOnOrder(o.getId());
            long gross = ledger.chargedGrossOnOrder(o.getId());
            if (paid > gross) {
                out.add(o.getOrderNo() + "：核销 " + paid + " 超过原始挂账 " + gross);
            }
        }
        for (Long customerId : entryMapper.selectDistinctCustomerIds()) {
            Customer c = customerMapper.selectById(customerId);
            if (c == null) {
                continue;
            }
            long bal = ledger.balance(customerId);
            List<LedgerEntry> entries = ledger.entriesOf(customerId);
            long gross = entries.stream().filter(e -> !"PAYMENT".equals(e.getType()))
                    .mapToLong(LedgerEntry::getAmountFen).sum();
            long paid = entries.stream().filter(e -> "PAYMENT".equals(e.getType()))
                    .mapToLong(e -> -e.getAmountFen()).sum();
            long allocated = ledger.allocatedOf(customerId);
            long prepaid = ledger.prepaidOf(customerId);
            if (bal != gross - paid) {
                out.add("客户 " + c.getId() + "：余额 " + bal + " 与「挂账类 " + gross + " − 收款 " + paid + "」不一致");
            }
            if (paid != allocated + prepaid) {
                out.add("客户 " + c.getId() + "：收款 " + paid + " 没有被核销关系完整覆盖（已核销 " + allocated + " + 预收 " + prepaid + "）");
            }
        }
        return out;
    }

    public Stats stats() {
        List<Order> today = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .ge(Order::getCreateTime, java.time.LocalDate.now().atStartOfDay()));
        long doing = today.stream().filter(o -> !OrderStatus.of(o.getStatus()).isTerminal()).count();
        long owed = 0;
        for (Customer c : customerMapper.selectList(Wrappers.emptyWrapper())) {
            long b = ledger.balance(c.getId());
            if (b > 0) {
                owed += b;
            }
        }
        long advTotal = orders.advanceOutstanding();
        java.time.LocalDate day = java.time.LocalDate.now();
        long todayFee = serviceFeeBetween(day.atStartOfDay(), day.plusDays(1).atStartOfDay());
        long yesterdayFee = serviceFeeBetween(day.minusDays(1).atStartOfDay(), day.atStartOfDay());
        long collected = entryMapper.selectList(Wrappers.<LedgerEntry>lambdaQuery()
                        .eq(LedgerEntry::getType, "PAYMENT"))
                .stream().mapToLong(e -> Math.abs(e.getAmountFen() == null ? 0 : e.getAmountFen())).sum();
        return new Stats(today.size(), (int) doing, owed, advTotal, issues().size(), todayFee, yesterdayFee, collected);
    }

    /** 服务费按结单时间统计，和账单页顶部固定数保持同一口径。 */
    private long serviceFeeBetween(LocalDateTime from, LocalDateTime to) {
        return orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                        .eq(Order::getStatus, OrderStatus.FINISHED.name())
                        .ge(Order::getFinishedAt, from).lt(Order::getFinishedAt, to))
                .stream().mapToLong(o -> (o.getServiceFeeFen() == null ? 0 : o.getServiceFeeFen())
                        + (o.getExtraFeeFen() == null ? 0 : o.getExtraFeeFen())).sum();
    }

    public record Stats(int todayOrders, int inProgress, long owedFen, long advanceOutstandingFen, int issueCount,
                        long todayServiceFeeFen, long yesterdayServiceFeeFen, long collectedTotalFen) {
    }
}
