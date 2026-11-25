package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.example.paotui.common.Result;
import com.example.paotui.dto.OrderCreateCmd;
import com.example.paotui.dto.OrderEditCmd;
import com.example.paotui.dto.OrderView;
import com.example.paotui.enums.ActorRole;
import com.example.paotui.enums.LedgerType;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.service.HealthService;
import com.example.paotui.service.NotifyService;
import com.example.paotui.service.OrderService;
import com.example.paotui.service.OrderViewService;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 调度台：看板、录单、代操作、争议冲正。 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderService orders;
    private final OrderViewService views;
    private final NotifyService notify;
    private final HealthService health;

    @GetMapping("/orders")
    @RequirePerm("order.view")
    public Result<List<OrderView>> list(@RequestParam(required = false) String status,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                       @RequestParam(required = false) Long customerId,
                                       @RequestParam(required = false) Long merchantId,
                                       @RequestParam(required = false) Long riderId,
                                       @RequestParam(defaultValue = "200") int limit,
                                       @RequestParam(defaultValue = "false") boolean all) {
        if (from != null || to != null) {
            LocalDate start = from == null ? (to == null ? LocalDate.now() : to) : from;
            LocalDate end = to == null ? start : to;
            if (end.isBefore(start)) {
                throw new com.example.paotui.common.BizException("结束日期不能早于开始日期");
            }
            if (java.time.temporal.ChronoUnit.DAYS.between(start, end) > 366) {
                throw new com.example.paotui.common.BizException("日期区间最多支持 12 个月");
            }
            return Result.ok(views.list(orders.listRange(status, start, end, customerId, merchantId, riderId, limit)));
        }
        LocalDate d = all ? null : (day == null ? LocalDate.now() : day);
        return Result.ok(views.list(orders.list(status, d, customerId, merchantId, riderId, limit)));
    }

    @GetMapping("/orders/{id}")
    @RequirePerm("order.view")
    public Result<Map<String, Object>> detail(@PathVariable long id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("order", views.ofId(id));
        out.put("logs", orders.logsOf(id));
        out.put("editLogs", orders.editLogs(id));
        out.put("notices", notify.ofOrder(id));
        return Result.ok(out);
    }

    @PostMapping("/orders")
    @RequirePerm("order.create")
    public Result<OrderView> create(@Valid @RequestBody OrderCreateCmd cmd) {
        return Result.ok(views.of(orders.create(cmd)));
    }

    @PostMapping("/orders/{id}/dispatch")
    @RequirePerm("order.dispatch")
    public Result<OrderView> dispatch(@PathVariable long id, @RequestBody RiderReq req) {
        return Result.ok(views.of(orders.dispatch(id, req.riderId)));
    }

    @PostMapping("/orders/{id}/pick")
    @RequirePerm("order.flow")
    public Result<OrderView> pick(@PathVariable long id, @RequestBody PickReq req) {
        return Result.ok(views.of(orders.markPicked(id, req.goodsRealFen, req.merchantAmounts, req.receiptAttachmentId, req.method)));
    }

    /** 配送完成：送达 + 收款一次完成。 */
    @PostMapping("/orders/{id}/complete")
    @RequirePerm("order.flow")
    public Result<OrderView> complete(@PathVariable long id, @RequestBody CompleteReq req) {
        return Result.ok(views.of(orders.completeDelivery(id, req.attachmentId,
                req.paidFen == null ? 0L : req.paidFen,
                req.method == null ? "cash" : req.method)));
    }

    @PostMapping("/orders/{id}/cancel")
    @RequirePerm("order.cancel")
    public Result<OrderView> cancel(@PathVariable long id, @RequestBody CancelReq req) {
        return Result.ok(views.of(orders.cancel(id, req.code, req.text, req.recoveredFen, Boolean.TRUE.equals(req.markLoss))));
    }

    /** 改单：状态白名单在 Service 里把关，改了什么会写进 edit_log。 */
    @PutMapping("/orders/{id}")
    @RequirePerm("order.edit")
    public Result<OrderView> edit(@PathVariable long id, @RequestBody OrderEditCmd cmd) {
        return Result.ok(views.of(orders.editOrder(id, cmd)));
    }

    @GetMapping("/orders/{id}/edit-logs")
    @RequirePerm("order.view")
    public Result<java.util.List<com.example.paotui.entity.OrderEditLog>> editLogs(@PathVariable long id) {
        orders.require(id);
        return Result.ok(orders.editLogs(id));
    }

    @PostMapping("/orders/{id}/adjust")
    @RequirePerm("money.adjust")
    public Result<OrderView> adjust(@PathVariable long id, @RequestBody AdjustReq req) {
        LedgerType type = req.type == null ? LedgerType.ADJUST : LedgerType.valueOf(req.type);
        // direction 是给骑手用的口语化方向；老前端仍可只传带符号的 deltaFen
        return Result.ok(views.of(orders.adjustAmount(id, req.deltaFen == null ? 0L : req.deltaFen,
                req.reason, type, req.direction)));
    }

    @GetMapping("/statuses")
    @RequirePerm("NONE")
    public Result<List<Map<String, String>>> statuses() {
        return Result.ok(Arrays.stream(OrderStatus.values()).map(s -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("code", s.name());
            m.put("label", s.getLabel());
            m.put("terminal", String.valueOf(s.isTerminal()));
            return m;
        }).toList());
    }

    @GetMapping("/health")
    @RequirePerm("NONE")
    public Result<Map<String, Object>> health() {
        HealthService.Stats s = health.stats();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("todayOrders", s.todayOrders());
        out.put("inProgress", s.inProgress());
        out.put("owedFen", s.owedFen());
        out.put("advanceOutstandingFen", s.advanceOutstandingFen());
        out.put("todayServiceFeeFen", s.todayServiceFeeFen());
        out.put("yesterdayServiceFeeFen", s.yesterdayServiceFeeFen());
        out.put("totalBillFen", s.owedFen());
        out.put("collectedTotalFen", s.collectedTotalFen());
        out.put("issues", s.issueCount() == 0 ? List.of() : health.issues());
        out.put("channelStats", notify.channelStats());
        return Result.ok(out);
    }

    @Data
    public static class RiderReq {
        public Long riderId;
    }

    @Data
    public static class PickReq {
        public Long goodsRealFen;
        public Map<Long, Long> merchantAmounts;
        public Long receiptAttachmentId;
        public String method;
    }

    @Data
    public static class CompleteReq {
        public Long attachmentId;
        public Long paidFen;
        public String method;
    }

    @Data
    public static class CancelReq {
        public String code;
        public String text;
        public Long recoveredFen;
        public Boolean markLoss;
    }

    @Data
    public static class AdjustReq {
        public Long deltaFen;
        public String reason;
        public String type;
        /** merchant_refund 商家退我钱 / pay_merchant 我补给商家 / waive 给客户免掉 */
        public String direction;
    }
}
