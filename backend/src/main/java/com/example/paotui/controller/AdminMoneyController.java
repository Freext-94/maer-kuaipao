package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.LedgerEntry;
import com.example.paotui.entity.Order;
import com.example.paotui.entity.OrderException;
import com.example.paotui.entity.User;
import com.example.paotui.entity.CustomerRepayRequest;
import com.example.paotui.dto.OrderView;
import com.example.paotui.enums.LedgerType;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.CustomerRepayRequestMapper;
import com.example.paotui.mapper.OrderExceptionMapper;
import com.example.paotui.mapper.LedgerEntryMapper;
import com.example.paotui.mapper.OrderMapper;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.service.HealthService;
import com.example.paotui.service.LedgerService;
import com.example.paotui.service.OrderService;
import com.example.paotui.service.OrderViewService;
import com.example.paotui.security.Ctx;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** 钱的事：收款登记、额度、争议、对账单。 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminMoneyController {

    private final LedgerService ledger;
    private final HealthService health;
    private final CustomerMapper customerMapper;
    private final OrderMapper orderMapper;
    private final OrderExceptionMapper exceptionMapper;
    private final LedgerEntryMapper ledgerEntryMapper;
    private final UserMapper userMapper;
    private final OrderService orders;
    private final OrderViewService orderViews;
    private final CustomerRepayRequestMapper repayRequests;

    @GetMapping("/bills")
    @RequirePerm("money.view")
    public Result<Map<String, Object>> bill(@RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate from,
                                            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate to,
                                            @RequestParam(required = false) String q,
                                            @RequestParam(defaultValue = "false") boolean all) {
        // all=true：不按日期/状态过滤，列出全部订单；否则保留原区间内已结单口径（兼容其他调用方）
        boolean allTime = all || (from == null && to == null);
        LocalDate start = from == null ? LocalDate.now() : from;
        LocalDate end = to == null ? start : to;
        if (!allTime && (end.isBefore(start) || java.time.temporal.ChronoUnit.DAYS.between(start, end) > 366)) {
            throw new BizException("账单日期范围最多 12 个月");
        }
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Order> qw =
                Wrappers.<Order>lambdaQuery().orderByDesc(Order::getFinishedAt);
        if (!allTime) {
            qw.eq(Order::getStatus, OrderStatus.FINISHED.name())
              .ge(Order::getFinishedAt, start.atStartOfDay())
              .lt(Order::getFinishedAt, end.plusDays(1).atStartOfDay());
        } else {
            // 与订单页统计口径一致：已取消单不计入货款/服务费
            qw.ne(Order::getStatus, OrderStatus.CANCELLED.name());
        }
        List<OrderView> rows = orderViews.list(orderMapper.selectList(qw.last("LIMIT 5000")));
        String kw = q == null ? "" : q.trim().toLowerCase();
        if (!kw.isEmpty()) {
            rows = rows.stream().filter(o -> containsText(o.getOrderNo(), kw)
                    || containsText(o.getCustomerName(), kw) || containsText(o.getCustomerPhone(), kw)
                    || containsText(o.getGoodsText(), kw)).toList();
        }
        List<LedgerEntry> entries = allTime
                ? ledgerEntryMapper.selectList(Wrappers.<LedgerEntry>lambdaQuery().orderByDesc(LedgerEntry::getOccurredAt).last("LIMIT 5000"))
                : ledgerEntryMapper.selectList(Wrappers.<LedgerEntry>lambdaQuery()
                        .ge(LedgerEntry::getOccurredAt, start.atStartOfDay()).lt(LedgerEntry::getOccurredAt, end.plusDays(1).atStartOfDay())
                        .orderByDesc(LedgerEntry::getOccurredAt));
        long goods = rows.stream().mapToLong(o -> o.getGoodsRealFen() == null ? o.getGoodsEstFen() : o.getGoodsRealFen()).sum();
        long service = rows.stream().mapToLong(o -> (o.getServiceFeeFen() == null ? 0 : o.getServiceFeeFen())).sum();
        long extra = rows.stream().mapToLong(o -> (o.getExtraFeeFen() == null ? 0 : o.getExtraFeeFen())).sum();
        List<LedgerEntry> payments = entries.stream().filter(e -> "PAYMENT".equals(e.getType())).toList();
        HealthService.Stats stats = health.stats();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", start); out.put("to", end); out.put("orders", rows); out.put("entries", entries);
        out.put("goodsFen", goods); out.put("serviceFen", service); out.put("extraFen", extra);
        out.put("receivableFen", rows.stream().mapToLong(OrderView::getReceivableFen).sum());
        out.put("collectedFen", payments.stream().mapToLong(e -> Math.abs(e.getAmountFen())).sum());
        out.put("owedFen", rows.stream().mapToLong(OrderView::getOwedFen).sum());
        out.put("orderPaidFen", rows.stream().mapToLong(OrderView::getPaidFen).sum());
        out.put("customerOwedFen", stats.owedFen());
        out.put("todayServiceFeeFen", stats.todayServiceFeeFen());
        out.put("yesterdayServiceFeeFen", stats.yesterdayServiceFeeFen());
        out.put("totalBillFen", stats.owedFen());
        out.put("collectedTotalFen", stats.collectedTotalFen());
        out.put("orderCount", rows.size());
        out.put("paymentCount", payments.size());
        return Result.ok(out);
    }

    private boolean containsText(String value, String kw) {
        return value != null && value.toLowerCase().contains(kw);
    }

    /** 客户欠款总览：账单页和「客户账单」共用，避免前端逐客户拉流水。 */
    @GetMapping("/debts")
    @RequirePerm("money.view")
    public Result<List<Map<String, Object>>> debts() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Customer c : customerMapper.selectList(Wrappers.emptyWrapper())) {
            User u = userMapper.selectById(c.getUserId());
            List<LedgerEntry> entries = ledger.entriesOf(c.getId());
            long collected = entries.stream().filter(e -> "PAYMENT".equals(e.getType()))
                    .mapToLong(e -> Math.abs(e.getAmountFen() == null ? 0 : e.getAmountFen())).sum();
            LocalDateTime lastPayment = entries.stream().filter(e -> "PAYMENT".equals(e.getType()))
                    .map(LedgerEntry::getOccurredAt).filter(Objects::nonNull)
                    .max(LocalDateTime::compareTo).orElse(null);
            Order lastOrder = orderMapper.selectOne(Wrappers.<Order>lambdaQuery()
                    .eq(Order::getCustomerId, c.getId()).orderByDesc(Order::getCreateTime).last("LIMIT 1"));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("customerId", c.getId());
            m.put("name", u == null ? "" : u.getName());
            m.put("phone", u == null ? "" : u.getPhone());
            m.put("note", c.getNote());
            m.put("owedFen", Math.max(0, ledger.balance(c.getId())));
            m.put("collectedFen", collected);
            m.put("lastOrderAt", lastOrder == null ? null : lastOrder.getCreateTime());
            m.put("lastPaymentAt", lastPayment);
            out.add(m);
        }
        out.sort((a, b) -> Long.compare((Long) b.get("owedFen"), (Long) a.get("owedFen")));
        return Result.ok(out);
    }

    @PostMapping("/ledger/rebuild")
    @RequirePerm("setting.manage")
    public Result<Map<String, Object>> rebuild() {
        int n = ledger.reallocateAll();
        List<String> issues = health.issues();
        return Result.ok(Map.of("customers", n, "issues", issues));
    }

    @GetMapping("/ledger/{customerId}")
    @RequirePerm("money.view")
    public Result<Map<String, Object>> ledgerOf(@PathVariable long customerId) {
        Customer c = customerMapper.selectById(customerId);
        if (c == null) {
            throw new BizException("客户不存在");
        }
        List<LedgerEntry> entries = ledger.entriesOf(customerId);
        List<LedgerEntry> newestFirst = new java.util.ArrayList<>(entries);
        java.util.Collections.reverse(newestFirst);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("customerId", customerId);
        out.put("owedFen", ledger.balance(customerId));
        out.put("prepaidFen", ledger.prepaidOf(customerId));
        out.put("entries", withOrderNo(newestFirst));
        // Q-17：账单详情列出该客户全部状态订单（不再只给未付单），前端据此渲染、不再展示收款记录
        out.put("orders", orderViews.list(orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getCustomerId, customerId)
                .orderByDesc(Order::getCreateTime).last("LIMIT 500"))));
        out.put("openCharges", ledger.openCharges(customerId).stream().map(oc -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("entryId", oc.entry().getId());
            m.put("orderId", oc.entry().getOrderId());
            m.put("orderNo", orderNo(oc.entry().getOrderId()));
            m.put("openFen", oc.openFen());
            m.put("occurredAt", oc.entry().getOccurredAt());
            return m;
        }).toList());
        out.put("exceptions", openExceptionsOf(customerId));
        out.put("repaymentRequests", repayRequests.selectList(Wrappers.<CustomerRepayRequest>lambdaQuery()
                .eq(CustomerRepayRequest::getCustomerId, customerId)
                .orderByDesc(CustomerRepayRequest::getCreateTime).last("LIMIT 20")));
        return Result.ok(out);
    }

    @GetMapping("/repayment-requests")
    @RequirePerm("money.view")
    public Result<List<Map<String, Object>>> pendingRepaymentRequests() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CustomerRepayRequest request : repayRequests.selectList(Wrappers.<CustomerRepayRequest>lambdaQuery()
                .eq(CustomerRepayRequest::getStatus, "pending").orderByAsc(CustomerRepayRequest::getCreateTime))) {
            Customer customer = customerMapper.selectById(request.getCustomerId());
            User user = customer == null ? null : userMapper.selectById(customer.getUserId());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", request.getId()); row.put("customerId", request.getCustomerId());
            row.put("customerName", user == null ? "" : user.getName()); row.put("customerPhone", user == null ? "" : user.getPhone());
            row.put("amountFen", request.getAmountFen()); row.put("method", request.getMethod()); row.put("createTime", request.getCreateTime());
            out.add(row);
        }
        return Result.ok(out);
    }

    @PostMapping("/repayment-requests/{id}/confirm")
    @RequirePerm("money.receive")
    @Transactional
    public Result<Map<String, Object>> confirmRepaymentRequest(@PathVariable long id) {
        CustomerRepayRequest request = repayRequests.selectById(id);
        if (request == null) throw new BizException("还款申报不存在");
        if (!"pending".equals(request.getStatus())) throw new BizException("这笔还款申报已经处理");
        long balance = Math.max(0, ledger.balance(request.getCustomerId()));
        if (request.getAmountFen() > balance) throw new BizException("申报金额超过当前欠款，请核对后由管理员单独登记实际收款");
        ledger.post(request.getCustomerId(), null, LedgerType.PAYMENT, -request.getAmountFen(),
                request.getMethod(), "确认客户还款申报 #" + id, Ctx.actorName(), "customer-repay-request:" + id, null);
        request.setStatus("confirmed"); request.setHandledBy(Ctx.actorName()); request.setHandledAt(LocalDateTime.now());
        repayRequests.updateById(request);
        return Result.ok(Map.of("owedFen", ledger.balance(request.getCustomerId())));
    }

    @PostMapping("/repayment-requests/{id}/reject")
    @RequirePerm("money.receive")
    @Transactional
    public Result<Void> rejectRepaymentRequest(@PathVariable long id) {
        CustomerRepayRequest request = repayRequests.selectById(id);
        if (request == null) throw new BizException("还款申报不存在");
        if (!"pending".equals(request.getStatus())) throw new BizException("这笔还款申报已经处理");
        request.setStatus("rejected"); request.setHandledBy(Ctx.actorName()); request.setHandledAt(LocalDateTime.now());
        repayRequests.updateById(request);
        return Result.ok();
    }

    /** 流水要能被倒查，所以每条都得带上单号；光给 orderId 数字对账时没用。 */
    private List<Map<String, Object>> withOrderNo(List<LedgerEntry> entries) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (LedgerEntry e : entries) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("occurredAt", e.getOccurredAt());
            m.put("type", e.getType());
            m.put("amountFen", e.getAmountFen());
            m.put("orderId", e.getOrderId());
            m.put("orderNo", orderNo(e.getOrderId()));
            m.put("method", e.getMethod());
            m.put("note", e.getNote());
            m.put("operator", e.getOperator());
            m.put("periodMonth", e.getPeriodMonth());
            out.add(m);
        }
        return out;
    }

    /** 只看这个客户名下还没处理完的争议单。 */
    private List<OrderException> openExceptionsOf(long customerId) {
        List<Long> orderIds = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getCustomerId, customerId)).stream().map(Order::getId).toList();
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return exceptionMapper.selectList(Wrappers.<OrderException>lambdaQuery()
                .eq(OrderException::getStatus, "open").in(OrderException::getOrderId, orderIds));
    }

    @PostMapping("/ledger/{customerId}/payment")
    @RequirePerm("money.receive")
    public Result<Map<String, Object>> payment(@PathVariable long customerId, @RequestBody PaymentReq req) {
        if (req.amountFen == null || req.amountFen <= 0) {
            throw new BizException("收款金额必须大于 0");
        }
        long balance = Math.max(0, ledger.balance(customerId));
        if (req.amountFen > balance) {
            throw new BizException("收款金额超过当前欠款；多收的钱请另外登记");
        }
        ledger.post(customerId, req.orderId, LedgerType.PAYMENT, -req.amountFen,
                req.method == null ? "微信转账" : req.method,
                req.note == null || req.note.isBlank() ? "老板登记收款" : req.note,
                Ctx.actorName(), "pay:" + System.nanoTime() + ":" + customerId, req.evidenceAttachmentId);
        return Result.ok(Map.of("owedFen", ledger.balance(customerId)));
    }

    @PostMapping("/ledger/{customerId}/waive")
    @RequirePerm("money.adjust")
    public Result<Map<String, Object>> waive(@PathVariable long customerId, @RequestBody WaiveReq req) {
        if (req.amountFen == null || req.amountFen <= 0) {
            throw new BizException("减免金额必须大于 0");
        }
        if (req.reason == null || req.reason.isBlank()) {
            throw new BizException("减免必须写原因，这是老板自己让出去的钱");
        }
        ledger.post(customerId, req.orderId, LedgerType.WAIVE, -req.amountFen, "", req.reason,
                Ctx.actorName(), "waive:" + System.nanoTime() + ":" + customerId, null);
        return Result.ok(Map.of("owedFen", ledger.balance(customerId)));
    }

    @PostMapping("/exceptions")
    @RequirePerm("money.adjust")
    public Result<OrderException> openException(@RequestBody ExceptionReq req) {
        Order o = orderMapper.selectById(req.orderId);
        if (o == null) {
            throw new BizException("订单不存在");
        }
        OrderException x = new OrderException();
        x.setOrderId(o.getId());
        x.setType(req.type == null ? "goods_cost_dispute" : req.type);
        x.setDisputedFen(req.disputedFen == null ? 0L : req.disputedFen);
        x.setStatus("open");
        x.setText(req.text == null ? "" : req.text);
        x.setCreator(Ctx.actorName());
        exceptionMapper.insert(x);
        return Result.ok(x);
    }

    private String orderNo(Long orderId) {
        if (orderId == null) {
            return "";
        }
        Order o = orderMapper.selectById(orderId);
        return o == null ? "" : o.getOrderNo();
    }

    @Data
    public static class PaymentReq {
        public Long amountFen;
        public String method;
        public String note;
        public Long orderId;
        public Long evidenceAttachmentId;
    }

    @Data
    public static class WaiveReq {
        public Long amountFen;
        public Long orderId;
        public String reason;
    }

    @Data
    public static class ExceptionReq {
        public Long orderId;
        public String type;
        public Long disputedFen;
        public String text;
    }

}
