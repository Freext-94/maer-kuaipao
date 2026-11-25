package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.dto.OrderCreateCmd;
import com.example.paotui.dto.OrderEditCmd;
import com.example.paotui.entity.Address;
import com.example.paotui.entity.Advance;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.Order;
import com.example.paotui.entity.OrderEditLog;
import com.example.paotui.entity.OrderItem;
import com.example.paotui.entity.OrderMerchant;
import com.example.paotui.entity.OrderStatusLog;
import com.example.paotui.entity.RiderTask;
import com.example.paotui.entity.User;
import com.example.paotui.enums.ActorRole;
import com.example.paotui.enums.LedgerType;
import com.example.paotui.enums.NotifyChannel;
import com.example.paotui.enums.NotifyStatus;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.mapper.AdvanceMapper;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.MerchantMapper;
import com.example.paotui.mapper.OrderEditLogMapper;
import com.example.paotui.mapper.OrderItemMapper;
import com.example.paotui.mapper.OrderMerchantMapper;
import com.example.paotui.mapper.OrderMapper;
import com.example.paotui.mapper.OrderStatusLogMapper;
import com.example.paotui.mapper.RiderTaskMapper;
import com.example.paotui.mapper.ServiceTypeMapper;
import com.example.paotui.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 订单状态机。流转白名单在 move() 单点把关，Service 之外不允许直接改 status。
 *
 * 三条硬规则（都是被现实咬过的）：
 * · 取货时录的实付货款一旦写下就锁死，改只能加冲正流水；
 * · 结单必须先有挂账流水，实收不得超过应收；
 * · 垫付没交代（追回或认损）的单，不许进终态。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private static final SecureRandom RNG = new SecureRandom();
    private static final String NO_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479";

    private final OrderMapper orderMapper;
    private final OrderEditLogMapper editLogMapper;
    private final SettingService settingService;
    private final OrderItemMapper itemMapper;
    private final OrderMerchantMapper orderMerchantMapper;
    private final MerchantMapper merchantMapper;
    private final RiderTaskMapper taskMapper;
    private final ServiceTypeMapper serviceTypeMapper;
    private final AdvanceMapper advanceMapper;
    private final OrderStatusLogMapper statusLogMapper;
    private final CustomerMapper customerMapper;
    private final UserMapper userMapper;
    private final CatalogService catalog;
    private final LedgerService ledger;
    private final NotifyService notify;
    private final ObjectMapper json;

    // ------------------------------------------------------------- 建单

    @Transactional
    public Order create(OrderCreateCmd cmd) {
        Customer customer = resolveCustomer(cmd);
        Address addr = resolveAddress(cmd, customer.getId());
        if (addr == null) {
            throw new BizException("这个客户还没有收货地址，请先补一个");
        }
        String serviceType = cmd.getServiceType() == null || cmd.getServiceType().isBlank()
                ? "buy" : cmd.getServiceType().trim();
        var configuredType = serviceTypeMapper.selectOne(Wrappers.<com.example.paotui.entity.ServiceType>lambdaQuery()
                .eq(com.example.paotui.entity.ServiceType::getCode, serviceType));
        if (configuredType == null || configuredType.getEnabled() == null || configuredType.getEnabled() != 1) {
            throw new BizException("该服务类型不存在或已暂停");
        }
        boolean needMerchant = "buy".equals(serviceType);
        Merchant merchant = null;
        List<Long> merchantIds = cmd.getMerchantIds() == null ? new ArrayList<>() : new ArrayList<>(cmd.getMerchantIds());
        if (needMerchant && cmd.getMerchantId() != null && !merchantIds.contains(cmd.getMerchantId())) merchantIds.add(cmd.getMerchantId());
        if (needMerchant && !merchantIds.isEmpty()) {
            // Q-03：商家可留空（如客户只描述要买什么、由骑手现场决定去哪买）；填了才校验存在性
            merchantIds = merchantIds.stream().distinct().toList();
            merchant = catalog.requireMerchant(merchantIds.get(0));
            for (Long merchantId : merchantIds) catalog.requireMerchant(merchantId);
        }
        validateServiceDetails(serviceType, cmd.getServiceDetails());
        if (cmd.getGoodsEstFen() < 0 || cmd.getServiceFeeFen() < 0) {
            throw new BizException("金额不能为负");
        }
        LocalDateTime now = LocalDateTime.now();
        Order o = new Order();
        o.setOrderNo(newOrderNo());
        // 订单来源由联系渠道判定：客户发起 → online，其余 → phone
        String channel = cmd.getSourceChannel() == null ? "" : cmd.getSourceChannel().trim();
        String derivedSource = cmd.getSource();
        if (!channel.isBlank()) {
            derivedSource = channel.startsWith("customer_") ? "online" : "phone";
        }
        if (derivedSource == null || derivedSource.isBlank()) {
            derivedSource = "phone";
        }
        o.setSource(derivedSource);
        if (!channel.isBlank() && !List.of("customer_call", "customer_wechat", "merchant_call", "merchant_wechat", "other").contains(channel)) {
            throw new BizException("联系渠道不正确");
        }
        if ("other".equals(channel) && (cmd.getSourceChannelNote() == null || cmd.getSourceChannelNote().isBlank())) {
            throw new BizException("请填写其他联系渠道");
        }
        o.setSourceChannel(channel);
        o.setSourceChannelNote("other".equals(channel) && cmd.getSourceChannelNote() != null ? cmd.getSourceChannelNote().trim() : "");
        o.setServiceType(serviceType);
        try { o.setServiceDetails(cmd.getServiceDetails() == null ? "{}" : json.writeValueAsString(cmd.getServiceDetails())); }
        catch (Exception e) { throw new BizException("服务信息格式不正确"); }
        o.setCreatedByUserId(currentUserId(cmd));
        o.setCustomerId(customer.getId());
        o.setMerchantId(merchant == null ? null : merchant.getId());
        o.setRiderId(cmd.getRiderId());
        o.setAddressSnapshot(writeSnapshot(addr));
        o.setGoodsEstFen(cmd.getGoodsEstFen());
        o.setGoodsRealFen(null);
        o.setServiceFeeFen(cmd.getServiceFeeFen());
        o.setExtraFeeFen(cmd.getExtraFeeFen() == null ? 0L : cmd.getExtraFeeFen());
        o.setStatus(OrderStatus.PENDING.name());
        o.setNote(cmd.getNote() == null ? "" : cmd.getNote());
        o.setCancelCode("");
        o.setCancelText("");
        o.setPeriodMonth(YearMonth.from(now).toString());
        o.setCreator(actorName());
        orderMapper.insert(o);

        for (Long merchantId : merchantIds) {
            OrderMerchant group = new OrderMerchant();
            group.setOrderId(o.getId()); group.setMerchantId(merchantId);
            group.setPrepStatus("pending"); group.setNote("");
            orderMerchantMapper.insert(group);
        }

        OrderItem it = new OrderItem();
        it.setOrderId(o.getId());
        it.setGoodsText(cmd.getGoodsText());
        it.setQty(1);
        it.setUnitEstFen(cmd.getGoodsEstFen());
        it.setCreator(actorName());
        itemMapper.insert(it);

        log(o.getId(), null, OrderStatus.PENDING, "CREATE",
                ("online".equals(cmd.getSource()) ? "客户自助下单" : "电话录单"));
        if (cmd.getRiderId() != null) {
            // 录单时通常已经定了谁去，省一次点击
            dispatch(o.getId(), cmd.getRiderId());
        }
        return orderMapper.selectById(o.getId());
    }

    private void validateServiceDetails(String type, Map<String, Object> details) {
        if ("buy".equals(type)) return;
        if (details == null) throw new BizException("请补充本项服务信息");
        List<String> required = switch (type) {
            case "pickup" -> List.of("pickupAddress", "deliveryAddress", "itemDescription");
            case "errand" -> List.of("taskDescription", "serviceAddress");
            case "transfer" -> List.of("pickupAddress", "destination", "scheduledAt");
            case "driver" -> List.of("pickupAddress", "destination", "scheduledAt", "vehiclePlate");
            default -> List.of("serviceDescription");
        };
        for (String key : required) {
            Object value = details.get(key);
            if (value == null || value.toString().isBlank()) throw new BizException("请填写服务信息：" + key);
        }
    }

    private Customer resolveCustomer(OrderCreateCmd cmd) {
        if (cmd.getCustomerId() != null) {
            return catalog.requireCustomer(cmd.getCustomerId());
        }
        return catalog.createCustomer(cmd.getNewCustomerName(), cmd.getNewCustomerPhone(), "录单时新建");
    }

    /** 优先用选中的已有地址；否则用本次填的一行新地址；都没有就取客户默认地址。 */
    private Address resolveAddress(OrderCreateCmd cmd, long customerId) {
        if (cmd.getAddressId() != null) {
            return catalog.requireAddress(customerId, cmd.getAddressId());
        }
        if (cmd.getAddress() != null && !cmd.getAddress().isBlank()) {
            return catalog.addAddress(customerId, cmd.getAddress(), false);
        }
        return catalog.requireAddress(customerId, null);
    }

    private String writeSnapshot(Address a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("address", a.getAddress());
        return writeJson(m);
    }

    private String newOrderNo() {
        StringBuilder sb = new StringBuilder(orderNoPrefix())
                .append(LocalDate.now().format(DateTimeFormatter.ofPattern("MMdd"))).append('-');
        for (int i = 0; i < 4; i++) {
            sb.append(NO_ALPHABET.charAt(RNG.nextInt(NO_ALPHABET.length())));
        }
        return sb.toString();
    }

    /** 单号前缀后台可改：默认 MR，设置里改成别的也不影响历史单。 */
    public String orderNoPrefix() {
        return settingService.get("order_no_prefix", "MR").trim().toUpperCase();
    }

    // ------------------------------------------------------------- 流转

    /** 派单给骑手：直接进入「取货中」。 */
    @Transactional
    public Order dispatch(long orderId, long riderId) {
        Order o = require(orderId);
        User rider = userMapper.selectById(riderId);
        if (rider == null) {
            throw new BizException("骑手不存在");
        }
        if (!OrderStatus.PENDING.name().equals(o.getStatus())) {
            throw new BizException("这单已经是「" + label(o) + "」，不用再派");
        }
        o.setRiderId(riderId);
        o.setDispatchedAt(LocalDateTime.now());
        move(o, OrderStatus.PICKING, "DISPATCH", ActorRole.STAFF,
                "指派" + rider.getName());
        orderMapper.updateById(o);

        RiderTask t = taskOf(orderId);
        if (t == null) {
            t = new RiderTask();
            t.setOrderId(o.getId());
            t.setAssignedByUserId(currentUserId(null));
            t.setCreator(actorName());
            t.setRiderId(riderId);
            t.setStatus("pending");
            taskMapper.insert(t);
        } else {
            t.setRiderId(riderId);
            t.setStatus("pending");
            taskMapper.updateById(t);
        }
        return o;
    }

    /** 取货：这里写下的货款就是不可变原值。0 元合法。取货后直接进入「配送中」。 */
    @Transactional
    public Order markPicked(long orderId, long goodsRealFen, Long receiptAttachmentId, String method) {
        List<OrderMerchant> groups = orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery().eq(OrderMerchant::getOrderId, orderId));
        if (groups.size() > 1) throw new BizException("这单涉及多家商家，请分别填写每家的实际货款");
        Map<Long, Long> amounts = groups.isEmpty() ? Map.of() : Map.of(groups.get(0).getMerchantId(), goodsRealFen);
        return markPicked(orderId, goodsRealFen, amounts, receiptAttachmentId, method);
    }

    @Transactional
    public Order markPicked(long orderId, long goodsRealFen, Map<Long, Long> merchantAmounts, Long receiptAttachmentId, String method) {
        Order o = require(orderId);
        if (goodsRealFen < 0) {
            throw new BizException("实际货款不能是负数；商家退钱请走「货款不对」");
        }
        if (o.getGoodsRealFen() != null) {
            throw new BizException("货款已锁定为 " + fen2yuan(o.getGoodsRealFen()) + "，只能走「货款不对」修改");
        }
        boolean noCost = goodsRealFen == 0;
        LocalDateTime now = LocalDateTime.now();
        o.setGoodsRealFen(goodsRealFen);
        move(o, OrderStatus.DELIVERING, "PICKED", ActorRole.RIDER,
                noCost ? "0 元取货（未垫付）"
                        : "垫付 " + fen2yuan(goodsRealFen) + (receiptAttachmentId == null ? "，未传小票" : "，小票已存证"));
        o.setPickedAt(now);
        orderMapper.updateById(o);

        OrderItem it = itemOf(orderId);
        if (it != null) {
            it.setUnitRealFen(goodsRealFen);
            itemMapper.updateById(it);
        }
        // 0 元不建垫付台账：没有垫钱，就不该有追回/损失这件事
        List<OrderMerchant> groups = orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery().eq(OrderMerchant::getOrderId, orderId));
        if (!groups.isEmpty()) {
            long merchantTotal = 0;
            for (OrderMerchant group : groups) {
                Long amount = merchantAmounts == null ? null : merchantAmounts.get(group.getMerchantId());
                if (amount == null) throw new BizException("请填写每家商家的实际货款；没有付款请填 0");
                if (amount < 0) throw new BizException("每家商家的实际货款不能是负数");
                merchantTotal = Math.addExact(merchantTotal, amount);
            }
            if (merchantTotal != goodsRealFen) throw new BizException("各商家实际货款合计必须等于实际货款");
            for (OrderMerchant group : groups) {
                Long amount = merchantAmounts.get(group.getMerchantId());
                group.setPickedGoodsFen(amount); group.setPrepStatus("picked"); orderMerchantMapper.updateById(group);
                if (amount > 0) createAdvance(o, group.getMerchantId(), amount, method, receiptAttachmentId);
            }
        } else if (!noCost && o.getMerchantId() != null) {
            // 代取/代办/代驾没有商家，不存在垫付给商家，别写 merchant_id 为空的垫付单
            createAdvance(o, o.getMerchantId(), goodsRealFen, method, receiptAttachmentId);
        }

        RiderTask t = taskOf(orderId);
        if (t != null) {
            t.setStatus("delivering");
            t.setPickedAt(now);
            taskMapper.updateById(t);
        }
        return o;
    }

    private void createAdvance(Order order, Long merchantId, long amountFen, String method, Long receiptAttachmentId) {
        Advance adv = new Advance(); adv.setOrderId(order.getId()); adv.setMerchantId(merchantId);
        adv.setAmountFen(amountFen); adv.setMethod(method == null ? "cash" : method);
        adv.setVoucherAttachmentId(receiptAttachmentId == null ? 0L : receiptAttachmentId);
        adv.setRecoveredFen(0L); adv.setLossFen(0L); adv.setStatus("paid"); adv.setCreator(actorName());
        advanceMapper.insert(adv);
    }

    /**
     * 配送完成：送达 + 收款确认一次完成。
     * 先挂全额账，再记当场实收，差额自然成为欠款（方式含「欠款」）。
     */
    @Transactional
    public Order completeDelivery(long orderId, Long photoAttachmentId, long paidFen, String method) {
        Order o = require(orderId);
        if (!OrderStatus.DELIVERING.name().equals(o.getStatus())) {
            throw new BizException("这单不是「配送中」，不能点配送完成");
        }
        long recv = receivable(o);
        if (paidFen < 0) {
            throw new BizException("实收不能为负");
        }
        long owedBefore = ledger.balance(o.getCustomerId());
        long totalDue = owedBefore + recv;
        if (paidFen > totalDue) {
            throw new BizException("实收 " + fen2yuan(paidFen) + " 大于客户历史欠款合计 " + fen2yuan(totalDue)
                    + "；多付的钱请在账单里记还款，不要塞进这一单");
        }
        String m = normalizeMethod(method);
        if ("credit".equals(m) && paidFen > 0) {
            throw new BizException("选了「欠款」就不能填实收；客户给了一部分就选微信/支付宝/现金");
        }
        if (!"credit".equals(m) && paidFen == 0) {
            throw new BizException("实收是 0，请把方式改成「欠款」再配送完成");
        }
        String op = actorName();
        ledger.post(o.getCustomerId(), o.getId(), LedgerType.CHARGE, baseOf(o), "", "配送完成挂账", op,
                "charge:" + o.getOrderNo(), null);
        if (paidFen > 0) {
            ledger.post(o.getCustomerId(), o.getId(), LedgerType.PAYMENT, -paidFen,
                    m, "配送完成收款（含历史欠款）", op, "pay:" + o.getOrderNo() + ":fin", null);
        }
        move(o, OrderStatus.FINISHED, "FINISH", ActorRole.RIDER,
                "配送完成" + (photoAttachmentId == null ? "，未拍送达照片" : "，已拍送达照片")
                        + "；本单应收 " + fen2yuan(recv) + "，实收 " + fen2yuan(paidFen) + "（" + methodLabel(m) + "），本次挂账 "
                        + fen2yuan(Math.max(0, totalDue - paidFen)));
        o.setDeliveredAt(LocalDateTime.now());
        o.setFinishedAt(LocalDateTime.now());
        orderMapper.updateById(o);
        RiderTask t = taskOf(orderId);
        if (t != null) {
            t.setStatus("delivered");
            t.setDeliveredAt(o.getDeliveredAt());
            taskMapper.updateById(t);
        }
        return o;
    }

    /**
     * 结单：先挂全额账，再记当场实收，差额自然成为欠款。
     * （保留给旧入口/特殊场景兜底，主流程走 completeDelivery）
     */
    @Transactional
    public Order finish(long orderId, long paidFen, String method) {
        Order o = require(orderId);
        long recv = receivable(o);
        if (paidFen < 0) {
            throw new BizException("实收不能为负");
        }
        if (paidFen > recv) {
            throw new BizException("实收 " + fen2yuan(paidFen) + " 大于应收 " + fen2yuan(recv)
                    + "；多付的钱请在账单里记还款，不要塞进这一单");
        }
        String m = normalizeMethod(method);
        if ("credit".equals(m) && paidFen > 0) {
            throw new BizException("选了「欠款」就不能填实收；客户给了一部分就选微信/支付宝/现金");
        }
        if (!"credit".equals(m) && paidFen == 0) {
            throw new BizException("实收是 0，请把方式改成「欠款」再结单");
        }
        String op = actorName();
        ledger.post(o.getCustomerId(), o.getId(), LedgerType.CHARGE, baseOf(o), "", "结单挂账", op,
                "charge:" + o.getOrderNo(), null);
        if (paidFen > 0) {
            ledger.post(o.getCustomerId(), o.getId(), LedgerType.PAYMENT, -paidFen,
                    m, "结单当场收款", op, "pay:" + o.getOrderNo() + ":fin", null);
        }
        move(o, OrderStatus.FINISHED, "FINISH", ActorRole.STAFF,
                "应收 " + fen2yuan(recv) + "，实收 " + fen2yuan(paidFen) + "（" + methodLabel(m) + "），挂账 "
                        + fen2yuan(recv - paidFen));
        o.setFinishedAt(LocalDateTime.now());
        orderMapper.updateById(o);
        return o;
    }

    /** 收款方式收口：英文码、中文、旧数据都认，统一存英文码。 */
    public static String normalizeMethod(String method) {
        if (method == null || method.isBlank()) {
            return "cash";
        }
        String s = method.trim();
        String lower = s.toLowerCase();
        if (lower.equals("wechat") || s.contains("微信")) {
            return "wechat";
        }
        if (lower.equals("alipay") || s.contains("支付宝")) {
            return "alipay";
        }
        if (lower.equals("credit") || s.contains("欠")) {
            return "credit";
        }
        return "cash";
    }

    public static String methodLabel(String code) {
        switch (code == null ? "cash" : code) {
            case "wechat": return "微信";
            case "alipay": return "支付宝";
            case "credit": return "欠款";
            default: return "现金";
        }
    }

    /**
     * 改单：只改"还没发生的事实"，不改已经发生的钱。
     * 已取货后买什么/货款锁死；已结单/已取消一律拒绝，要更正走「货款不对？」。
     */
    @Transactional
    public Order editOrder(long orderId, OrderEditCmd cmd) {
        Order o = require(orderId);
        OrderStatus st = OrderStatus.of(o.getStatus());
        if (st.isTerminal()) {
            throw new BizException("已结单/已取消的单不能改；钱不对请走「货款不对？」");
        }
        boolean goodsLocked = o.getGoodsRealFen() != null;
        String why = cmd.getReason() == null ? "" : cmd.getReason().trim();
        List<OrderEditLog> logs = new ArrayList<>();

        if (cmd.getSourceChannel() != null) {
            String next = cmd.getSourceChannel().trim();
            if (!next.isBlank() && !List.of("customer_call", "customer_wechat", "merchant_call", "merchant_wechat", "other").contains(next)) {
                throw new BizException("联系渠道不正确");
            }
            if ("other".equals(next) && (cmd.getSourceChannelNote() == null || cmd.getSourceChannelNote().isBlank())) {
                throw new BizException("请填写其他联系渠道");
            }
            String nextNote = "other".equals(next) && cmd.getSourceChannelNote() != null ? cmd.getSourceChannelNote().trim() : "";
            String oldValue = (o.getSourceChannel() == null ? "" : o.getSourceChannel())
                    + ((o.getSourceChannelNote() == null || o.getSourceChannelNote().isBlank()) ? "" : "：" + o.getSourceChannelNote());
            String newValue = next + (nextNote.isBlank() ? "" : "：" + nextNote);
            if (!Objects.equals(o.getSourceChannel(), next) || !Objects.equals(o.getSourceChannelNote(), nextNote)) {
                logs.add(editLog(orderId, "联系渠道", oldValue, newValue, why));
                o.setSourceChannel(next); o.setSourceChannelNote(nextNote);
            }
        }

        OrderItem it = itemOf(orderId);

        if (cmd.getGoodsText() != null && !cmd.getGoodsText().isBlank()) {
            if (goodsLocked) {
                throw new BizException("已取货，买什么不能改了；要补差价请走「货款不对？」");
            }
            String t = cmd.getGoodsText().trim();
            if (it != null && !t.equals(it.getGoodsText())) {
                logs.add(editLog(orderId, "买什么", it.getGoodsText(), t, why));
                it.setGoodsText(t);
                itemMapper.updateById(it);
            }
        }

        if (cmd.getGoodsEstFen() != null) {
            if (goodsLocked) {
                throw new BizException("已取货，货款已经锁定，不能再改估价");
            }
            long v = cmd.getGoodsEstFen();
            if (v < 0) {
                throw new BizException("货款估价不能是负数");
            }
            if (!Objects.equals(o.getGoodsEstFen(), v)) {
                logs.add(editLog(orderId, "货款估价", fen2yuan(o.getGoodsEstFen()), fen2yuan(v), why));
                o.setGoodsEstFen(v);
            }
            if (it != null) {
                it.setUnitEstFen(v);
                itemMapper.updateById(it);
            }
        }

        if (cmd.getServiceFeeFen() != null) {
            long v = cmd.getServiceFeeFen();
            if (v < 0) {
                throw new BizException("跑腿费不能是负数");
            }
            if (!Objects.equals(o.getServiceFeeFen(), v)) {
                logs.add(editLog(orderId, "跑腿费", fen2yuan(o.getServiceFeeFen()), fen2yuan(v), why));
                o.setServiceFeeFen(v);
            }
        }

        if (cmd.getNote() != null && !cmd.getNote().equals(o.getNote())) {
            logs.add(editLog(orderId, "备注", o.getNote(), cmd.getNote(), why));
            o.setNote(cmd.getNote());
        }

        if (cmd.getAddress() != null && !cmd.getAddress().isBlank()) {
            Map<String, Object> snap = readSnapshot(o.getAddressSnapshot());
            String oldAddress = String.valueOf(snap.getOrDefault("address", ""));
            String newAddress = cmd.getAddress().trim();
            if (!newAddress.equals(oldAddress)) {
                snap.put("address", newAddress);
                o.setAddressSnapshot(writeJson(snap));
                logs.add(editLog(orderId, "送货地址", oldAddress, newAddress, why));
            }
        }

        if (cmd.getRiderId() != null && !cmd.getRiderId().equals(o.getRiderId())) {
            // 转单：取货中/配送中都允许换骑手（骑手特殊情况转给别的骑手）
            User rider = userMapper.selectById(cmd.getRiderId());
            if (rider == null) {
                throw new BizException("骑手不存在");
            }
            logs.add(editLog(orderId, "骑手",
                    o.getRiderId() == null ? "未指派" : String.valueOf(o.getRiderId()), rider.getName(), why));
            o.setRiderId(cmd.getRiderId());
            RiderTask t = taskOf(orderId);
            if (t != null) {
                t.setRiderId(cmd.getRiderId());
                taskMapper.updateById(t);
            }
        }

        if (cmd.getMerchantId() != null && !cmd.getMerchantId().equals(o.getMerchantId())) {
            // 改商家：客户填的商家不存在时，管理员改成正确商家（取货前才允许，取货后货款已按旧店垫付）
            if (goodsLocked) {
                throw new BizException("已取货，不能再改商家；要更正请走「货款不对？」");
            }
            Merchant nm = catalog.requireMerchant(cmd.getMerchantId());
            logs.add(editLog(orderId, "商家",
                    merchantName(o.getMerchantId()), nm.getName(), why));
            o.setMerchantId(cmd.getMerchantId());
        }

        if (logs.isEmpty()) {
            throw new BizException("没有改动任何内容");
        }
        orderMapper.updateById(o);
        logs.forEach(editLogMapper::insert);
        log(orderId, st, st, "EDIT",
                "改单：" + String.join("、", logs.stream().map(OrderEditLog::getField).toList())
                        + (why.isBlank() ? "" : "｜" + why));
        return o;
    }

    public List<OrderEditLog> editLogs(long orderId) {
        return editLogMapper.selectList(Wrappers.<OrderEditLog>lambdaQuery()
                .eq(OrderEditLog::getOrderId, orderId)
                .orderByDesc(OrderEditLog::getId));
    }

    private OrderEditLog editLog(long orderId, String field, String oldValue, String newValue, String reason) {
        OrderEditLog l = new OrderEditLog();
        l.setOrderId(orderId);
        l.setField(field);
        l.setOldValue(oldValue == null ? "" : oldValue);
        l.setNewValue(newValue == null ? "" : newValue);
        l.setReason(reason == null ? "" : reason);
        l.setActor(actorName());
        return l;
    }

    private String merchantName(Long merchantId) {
        if (merchantId == null) {
            return "未指定";
        }
        Merchant m = merchantMapper.selectById(merchantId);
        return m == null ? "未知商家#" + merchantId : m.getName();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readSnapshot(String jsonText) {
        try {
            if (jsonText == null || jsonText.isBlank()) {
                return new LinkedHashMap<>();
            }
            return json.readValue(jsonText, Map.class);
        } catch (Exception e) {
            throw new BizException("地址快照损坏，请联系管理员");
        }
    }

    private String writeJson(Map<String, Object> m) {
        try {
            return json.writeValueAsString(m);
        } catch (Exception e) {
            throw new BizException("地址快照生成失败");
        }
    }

    @Transactional
    public Order cancel(long orderId, String code, String text, Long recoveredFen, boolean markLoss) {
        Order o = require(orderId);
        if (OrderStatus.of(o.getStatus()).isTerminal()) {
            throw new BizException("这单已经结束了，要更正请走冲正");
        }
        if (code == null || code.isBlank()) {
            throw new BizException("取消必须选原因，月底要看是哪一环出问题");
        }
        List<Advance> advances = advancesOf(orderId);
        if (!advances.isEmpty()) {
            long total = advances.stream().mapToLong(Advance::getAmountFen).sum();
            long rec = recoveredFen == null ? 0L : recoveredFen;
            if (rec < 0 || rec > total) throw new BizException("追回金额必须在 0 ~ " + fen2yuan(total) + " 之间");
            if (rec < total && !markLoss) throw new BizException("还有 " + fen2yuan(total - rec) + " 垫付款未追回，确认损失后才能取消");
            long left = rec;
            for (Advance adv : advances) {
                long recovered = Math.min(left, adv.getAmountFen()); left -= recovered;
                adv.setRecoveredFen(recovered); adv.setLossFen(adv.getAmountFen() - recovered);
                adv.setStatus(recovered >= adv.getAmountFen() ? "settled" : "loss"); advanceMapper.updateById(adv);
            }
        }
        o.setCancelCode(code);
        o.setCancelText(text == null ? "" : text);
        move(o, OrderStatus.CANCELLED, "CANCEL", ActorRole.STAFF, code + (text == null ? "" : "｜" + text));
        o.setCancelledAt(LocalDateTime.now());
        orderMapper.updateById(o);
        return o;
    }

    /** 货款争议：加一条带符号的流水，原值一个字都不动。 */
    @Transactional
    public Order adjustAmount(long orderId, long deltaFen, String reason, LedgerType type) {
        return adjustAmount(orderId, deltaFen, reason, type, null);
    }

    /**
     * 口语化三分支：金额一律填正数，方向由按钮决定，骑手不用理解"冲正/减免"。
     * merchant_refund 商家退我钱（应收减）/ pay_merchant 我补给商家（应收加）/ waive 给客户免掉（应收减）。
     */
    @Transactional
    public Order adjustAmount(long orderId, long amountFen, String reason, LedgerType type, String direction) {
        Order o = require(orderId);
        if (reason == null || reason.isBlank()) {
            throw new BizException("要写一句原因，月底对不上时靠它");
        }
        long signed;
        LedgerType realType = type == null ? LedgerType.ADJUST : type;
        String actionText;
        if (direction != null && !direction.isBlank()) {
            switch (direction) {
                case "merchant_refund":
                    signed = -Math.abs(amountFen);
                    realType = LedgerType.ADJUST;
                    actionText = "商家退我钱";
                    break;
                case "pay_merchant":
                    signed = Math.abs(amountFen);
                    realType = LedgerType.ADJUST;
                    actionText = "我补给商家";
                    break;
                case "waive":
                    signed = -Math.abs(amountFen);
                    realType = LedgerType.WAIVE;
                    actionText = "给客户免掉";
                    break;
                default:
                    throw new BizException("不认识的调整方向：" + direction);
            }
            if (signed == 0) {
                throw new BizException("金额是 0，不用记这一笔");
            }
        } else {
            signed = amountFen;
            actionText = realType == LedgerType.WAIVE ? "给客户免掉" : "货款调整";
        }
        if (signed == 0) {
            throw new BizException("差额为 0，不用调");
        }
        ledger.post(o.getCustomerId(), orderId, realType, signed, "", reason, actorName(),
                realType.name().toLowerCase() + ":" + orderId + ":" + System.nanoTime(), null);
        // 应收变了，已收的核销关系必须跟着重算，否则会出现「核销 > 应收」的假告警
        ledger.reallocate(o.getCustomerId());
        log(orderId, OrderStatus.of(o.getStatus()), OrderStatus.of(o.getStatus()), "ADJUST",
                actionText + " " + fen2yuan(Math.abs(signed)) + "：" + reason);
        return o;
    }

    // ------------------------------------------------------------- 查询与派生值

    public long baseOf(Order o) {
        long goods = o.getGoodsRealFen() != null ? o.getGoodsRealFen() : o.getGoodsEstFen();
        return goods + o.getServiceFeeFen() + (o.getExtraFeeFen() == null ? 0 : o.getExtraFeeFen());
    }

    /** 应收 = 货款（取货后为实付）+ 服务费 + 该单冲正/减免。落库的挂账流水与它恒等。 */
    public long receivable(Order o) {
        return baseOf(o) + ledger.adjustmentsOf(o.getId());
    }

    public long owedOf(Order o) {
        return Math.max(0, receivable(o) - ledger.paidOnOrder(o.getId()));
    }

    public Order require(long id) {
        Order o = orderMapper.selectById(id);
        if (o == null) {
            throw new BizException("订单不存在");
        }
        return o;
    }

    public Order byNo(String no) {
        Order o = orderMapper.selectOne(Wrappers.<Order>lambdaQuery().eq(Order::getOrderNo, no));
        if (o == null) {
            throw new BizException("找不到单号 " + no);
        }
        return o;
    }

    public List<Order> list(String status, LocalDate day, Long customerId, Long merchantId, Long riderId, int limit) {
        var query = Wrappers.<Order>lambdaQuery()
                .eq(status != null && !status.isBlank(), Order::getStatus, status)
                .eq(customerId != null, Order::getCustomerId, customerId)
                .eq(riderId != null, Order::getRiderId, riderId)
                .ge(day != null, Order::getCreateTime, day == null ? null : day.atStartOfDay())
                .lt(day != null, Order::getCreateTime, day == null ? null : day.plusDays(1).atStartOfDay())
                .orderByDesc(Order::getId);
        if (merchantId != null) {
            List<Long> groupOrderIds = orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery()
                    .eq(OrderMerchant::getMerchantId, merchantId)).stream().map(OrderMerchant::getOrderId).distinct().toList();
            if (groupOrderIds.isEmpty()) query.eq(Order::getMerchantId, merchantId);
            else query.and(w -> w.eq(Order::getMerchantId, merchantId).or().in(Order::getId, groupOrderIds));
        }
        return orderMapper.selectList(query.last("LIMIT " + Math.min(Math.max(limit, 1), 500)));
    }

    /** 调度台订单页：按创建日期区间筛选，并按订单号排序。 */
    public List<Order> listRange(String status, LocalDate from, LocalDate to,
                                 Long customerId, Long merchantId, Long riderId, int limit) {
        var query = Wrappers.<Order>lambdaQuery()
                .eq(status != null && !status.isBlank(), Order::getStatus, status)
                .eq(customerId != null, Order::getCustomerId, customerId)
                .eq(riderId != null, Order::getRiderId, riderId)
                .ge(from != null, Order::getCreateTime, from == null ? null : from.atStartOfDay())
                .lt(to != null, Order::getCreateTime, to == null ? null : to.plusDays(1).atStartOfDay())
                .orderByAsc(Order::getOrderNo);
        if (merchantId != null) {
            List<Long> groupOrderIds = orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery()
                    .eq(OrderMerchant::getMerchantId, merchantId)).stream().map(OrderMerchant::getOrderId).distinct().toList();
            if (groupOrderIds.isEmpty()) query.eq(Order::getMerchantId, merchantId);
            else query.and(w -> w.eq(Order::getMerchantId, merchantId).or().in(Order::getId, groupOrderIds));
        }
        return orderMapper.selectList(query.last("LIMIT " + Math.min(Math.max(limit, 1), 500)));
    }

    public List<OrderStatusLog> logsOf(long orderId) {
        return statusLogMapper.selectList(Wrappers.<OrderStatusLog>lambdaQuery()
                .eq(OrderStatusLog::getOrderId, orderId).orderByAsc(OrderStatusLog::getOccurredAt).orderByAsc(OrderStatusLog::getId));
    }

    public RiderTask taskOf(long orderId) {
        return taskMapper.selectOne(Wrappers.<RiderTask>lambdaQuery().eq(RiderTask::getOrderId, orderId));
    }

    public Advance advanceOf(long orderId) {
        return advanceMapper.selectOne(Wrappers.<Advance>lambdaQuery().eq(Advance::getOrderId, orderId).last("LIMIT 1"));
    }

    public List<Advance> advancesOf(long orderId) {
        return advanceMapper.selectList(Wrappers.<Advance>lambdaQuery().eq(Advance::getOrderId, orderId).orderByAsc(Advance::getId));
    }

    public List<OrderMerchant> merchantGroups(long orderId) {
        return orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery().eq(OrderMerchant::getOrderId, orderId));
    }

    public OrderItem itemOf(long orderId) {
        return itemMapper.selectOne(Wrappers.<OrderItem>lambdaQuery().eq(OrderItem::getOrderId, orderId).orderByAsc(OrderItem::getId).last("LIMIT 1"));
    }

    public List<Order> pendingForMerchant(long merchantId) {
        // 商家端去备货：改为显示「骑手取走前的订单」（待派单/取货中），骑手取货即进入配送中后不再显示
        List<Long> groupOrderIds = orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery()
                .eq(OrderMerchant::getMerchantId, merchantId)).stream().map(OrderMerchant::getOrderId).distinct().toList();
        return orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .and(w -> { w.eq(Order::getMerchantId, merchantId); if (!groupOrderIds.isEmpty()) w.or().in(Order::getId, groupOrderIds); })
                .in(Order::getStatus, OrderStatus.PENDING.name(), OrderStatus.PICKING.name())
                .orderByAsc(Order::getCreateTime));
    }

    /** 平台还压在客户/商家身上的垫付，老板最该盯的一个数。 */
    public long advanceOutstanding() {
        return advanceMapper.selectList(Wrappers.<Advance>lambdaQuery().ne(Advance::getStatus, "settled"))
                .stream().mapToLong(a -> a.getAmountFen() - (a.getRecoveredFen() == null ? 0 : a.getRecoveredFen())
                        - (a.getLossFen() == null ? 0 : a.getLossFen())).sum();
    }

    public List<Order> activeForRider(long riderId) {

        return orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getRiderId, riderId)
                .in(Order::getStatus, OrderStatus.PICKING.name(), OrderStatus.DELIVERING.name())
                .orderByAsc(Order::getCreateTime));
    }

    // ------------------------------------------------------------- 内部

    private void move(Order o, OrderStatus target, String action, ActorRole role, String reason) {
        OrderStatus from = OrderStatus.of(o.getStatus());
        if (!from.canMoveTo(target)) {
            throw new BizException("状态不允许：" + from.getLabel() + " → " + target.getLabel());
        }
        o.setStatus(target.name());
        log(o.getId(), from, target, action, reason);
    }

    private void log(Long orderId, OrderStatus from, OrderStatus to, String action, String reason) {
        var p = com.example.paotui.security.Ctx.get();
        OrderStatusLog l = new OrderStatusLog();
        l.setOrderId(orderId);
        l.setFromStatus(from == null ? "" : from.name());
        l.setToStatus(to == null ? "" : to.name());
        l.setAction(action);
        l.setActorName(actorName());
        l.setActorRole(p == null ? "" : p.roleCode());
        l.setReason(reason == null ? "" : reason);
        l.setOccurredAt(LocalDateTime.now());
        l.setCreator(actorName());
        statusLogMapper.insert(l);
    }

    private String actorName() {
        return com.example.paotui.security.Ctx.actorName();
    }

    private Long currentUserId(OrderCreateCmd cmd) {
        var p = com.example.paotui.security.Ctx.get();
        if (p != null && p.getUserId() != null) {
            return p.getUserId();
        }
        if (cmd != null && cmd.getCustomerId() != null) {
            Customer c = customerMapper.selectById(cmd.getCustomerId());
            return c == null ? 0L : c.getUserId();
        }
        return 0L;
    }

    public String label(Order o) {
        return OrderStatus.of(o.getStatus()).getLabel();
    }

    public static String fen2yuan(long fen) {
        return String.format("%.2f", fen / 100.0);
    }
}
