package com.example.paotui.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.dto.OrderCreateCmd;
import com.example.paotui.dto.OrderView;
import com.example.paotui.entity.Attachment;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Order;
import com.example.paotui.entity.User;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.OrderMapper;
import com.example.paotui.security.Ctx;
import com.example.paotui.service.CatalogService;
import com.example.paotui.service.LedgerService;
import com.example.paotui.service.OrderService;
import com.example.paotui.service.OrderViewService;
import com.example.paotui.service.UploadService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 骑手端：看自己的单、配送过的订单、参与客户的欠款、能下单（可指派自己）。 */
@RestController
@RequestMapping("/api/r")
@RequiredArgsConstructor
public class RiderController {

    private final OrderService orders;
    private final OrderViewService views;
    private final UploadService uploads;
    private final OrderMapper orderMapper;
    private final CustomerMapper customerMapper;
    private final CatalogService catalog;
    private final LedgerService ledger;

    @GetMapping("/service-types")
    public Result<List<com.example.paotui.entity.ServiceType>> serviceTypes() { return Result.ok(catalog.serviceTypes()); }

    @GetMapping("/default-goods")
    public Result<List<com.example.paotui.entity.Goods>> defaultGoods() { return Result.ok(catalog.defaultGoods()); }

    /** 骑手自己的账单：按客户归集，只统计自己经手的单。支持 all/q，与管理端账单组件共用。 */
    @GetMapping("/bills")
    public Result<Map<String, Object>> bills(
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean all) {
        // all=true 或没传日期：查全部（与管理端账单口径一致，排除已取消）；否则按区间内已结单
        boolean allTime = all || (from == null && to == null);
        java.time.LocalDate start = from == null ? java.time.LocalDate.now() : from;
        java.time.LocalDate end = to == null ? start : to;
        if (!allTime && (end.isBefore(start) || java.time.temporal.ChronoUnit.DAYS.between(start, end) > 366)) {
            throw new BizException("账单日期范围最多 12 个月");
        }
        long riderId = Ctx.require().getUserId();
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Order> qw =
                Wrappers.<Order>lambdaQuery().eq(Order::getRiderId, riderId);
        if (!allTime) {
            qw.eq(Order::getStatus, "FINISHED")
              .ge(Order::getFinishedAt, start.atStartOfDay())
              .lt(Order::getFinishedAt, end.plusDays(1).atStartOfDay());
        } else {
            qw.ne(Order::getStatus, "CANCELLED");
        }
        List<OrderView> rows = views.list(orderMapper.selectList(qw.orderByDesc(Order::getFinishedAt).last("LIMIT 2000")));
        String kw = q == null ? "" : q.trim().toLowerCase();
        if (!kw.isEmpty()) {
            rows = rows.stream().filter(o -> containsText(o.getOrderNo(), kw)
                    || containsText(o.getCustomerName(), kw) || containsText(o.getCustomerPhone(), kw)
                    || containsText(o.getGoodsText(), kw)).toList();
        }
        Map<Long, Map<String, Object>> groups = new LinkedHashMap<>();
        long goods = 0, service = 0, paid = 0, owed = 0;
        for (OrderView o : rows) {
            goods += o.getGoodsRealFen() == null ? o.getGoodsEstFen() : o.getGoodsRealFen();
            service += o.getServiceFeeFen() == null ? 0 : o.getServiceFeeFen();
            paid += o.getPaidFen();
            owed += o.getOwedFen();
            Map<String, Object> g = groups.computeIfAbsent(o.getCustomerId(), k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                Customer c = customerMapper.selectById(k);
                User u = c == null ? null : catalog.userOf(c);
                m.put("customerId", k);
                m.put("customerName", u == null ? "" : u.getName());
                m.put("customerPhone", u == null ? "" : u.getPhone());
                m.put("orders", new ArrayList<OrderView>());
                m.put("goodsFen", 0L);
                m.put("serviceFen", 0L);
                m.put("paidFen", 0L);
                m.put("owedFen", 0L);
                return m;
            });
            @SuppressWarnings("unchecked") List<OrderView> list = (List<OrderView>) g.get("orders");
            list.add(o);
            g.put("goodsFen", (Long) g.get("goodsFen") + (o.getGoodsRealFen() == null ? o.getGoodsEstFen() : o.getGoodsRealFen()));
            g.put("serviceFen", (Long) g.get("serviceFen") + (o.getServiceFeeFen() == null ? 0 : o.getServiceFeeFen()));
            g.put("paidFen", (Long) g.get("paidFen") + o.getPaidFen());
            g.put("owedFen", (Long) g.get("owedFen") + o.getOwedFen());
        }
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("orderCount", rows.size());
        totals.put("goodsFen", goods);
        totals.put("serviceFen", service);
        totals.put("paidFen", paid);
        totals.put("owedFen", owed);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", start);
        out.put("to", end);
        out.put("totals", totals);
        out.put("customers", new ArrayList<>(groups.values()));
        return Result.ok(out);
    }

    private boolean containsText(String value, String kw) {
        return value != null && value.toLowerCase().contains(kw);
    }

    /** 骑手下单时选客户用；不暴露欠款以外的敏感数据。 */
    @GetMapping("/customer-options")
    public Result<List<Map<String, Object>>> customerOptions(@RequestParam(required = false) String q) {
        List<Customer> rows = (q == null || q.isBlank())
                ? catalog.listCustomers()
                : catalog.searchCustomers(q, 30);
        return Result.ok(rows.stream().map(c -> {
            User u = catalog.userOf(c);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("name", u == null ? "" : u.getName());
            m.put("phone", u == null ? "" : u.getPhone());
            m.put("note", c.getNote());
            m.put("addresses", catalog.addresses(c.getId()));
            return m;
        }).toList());
    }

    @GetMapping("/merchants")
    public Result<List<com.example.paotui.entity.Merchant>> merchants() {
        return Result.ok(catalog.listMerchants());
    }

    @GetMapping("/tasks")
    public Result<Map<String, Object>> tasks() {
        long riderId = Ctx.require().getUserId();
        List<Order> mine = orders.activeForRider(riderId);
        List<OrderView> list = views.list(mine);
        long advSum = mine.stream()
                .flatMap(o -> orders.advancesOf(o.getId()).stream())
                .filter(a -> !"settled".equals(a.getStatus()))
                .mapToLong(a -> a.getAmountFen() - (a.getRecoveredFen() == null ? 0 : a.getRecoveredFen())
                        - (a.getLossFen() == null ? 0 : a.getLossFen()))
                .sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", list);
        out.put("advanceOutstandingFen", advSum);
        return Result.ok(out);
    }

    @PostMapping("/orders/{id}/pick")
    public Result<OrderView> pick(@PathVariable long id, @RequestBody PickReq req) {
        belongCheck(id);
        return Result.ok(views.of(orders.markPicked(id, req.goodsRealFen, req.merchantAmounts, req.receiptAttachmentId, req.method)));
    }

    /** 配送完成：送达 + 收款一次完成。 */
    @PostMapping("/orders/{id}/complete")
    public Result<OrderView> complete(@PathVariable long id, @RequestBody CompleteReq req) {
        belongCheck(id);
        return Result.ok(views.of(orders.completeDelivery(id, req.attachmentId,
                req.paidFen == null ? 0L : req.paidFen,
                req.method == null ? "cash" : req.method)));
    }

    /** 我配送过的订单（历史，含已完成/取消）。 */
    @GetMapping("/history")
    public Result<List<OrderView>> history() {
        long riderId = Ctx.require().getUserId();
        List<Order> list = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getRiderId, riderId)
                .orderByDesc(Order::getId).last("LIMIT 100"));
        return Result.ok(views.list(list));
    }

    /** 我参与过的客户及其欠款（配送过的订单里涉及的客户）。 */
    @GetMapping("/customers")
    public Result<List<Map<String, Object>>> myCustomers() {
        long riderId = Ctx.require().getUserId();
        List<Long> customerIds = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                        .select(Order::getCustomerId).eq(Order::getRiderId, riderId))
                .stream().map(Order::getCustomerId).distinct().toList();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Long cid : customerIds) {
            Customer c = customerMapper.selectById(cid);
            if (c == null) {
                continue;
            }
            User u = catalog.userOf(c);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("customerId", cid);
            m.put("name", u.getName());
            m.put("phone", u.getPhone());
            m.put("owedFen", ledger.balance(cid));
            out.add(m);
        }
        return Result.ok(out);
    }

    /** 骑手下单：可指派自己（进入取货中）或不指派（进待派单）。 */
    @PostMapping("/orders")
    public Result<OrderView> create(@RequestBody RiderOrderReq req) {
        long riderId = Ctx.require().getUserId();
        Customer c = customerMapper.selectById(req.customerId);
        if (c == null) {
            throw new BizException("要选一位客户");
        }
        OrderCreateCmd cmd = new OrderCreateCmd();
        cmd.setSource("rider");
        cmd.setCustomerId(c.getId());
        cmd.setAddressId(req.addressId);
        cmd.setAddress(req.address);
        cmd.setMerchantId(req.merchantId);
        cmd.setMerchantIds(req.merchantIds);
        cmd.setServiceType(req.serviceType == null ? "buy" : req.serviceType);
        cmd.setServiceDetails(req.serviceDetails);
        cmd.setGoodsText(req.goodsText);
        cmd.setGoodsEstFen(req.goodsEstFen == null ? 0L : req.goodsEstFen);
        cmd.setServiceFeeFen(req.serviceFeeFen == null ? 1000L : req.serviceFeeFen);
        cmd.setRiderId(req.assignSelf ? riderId : null);
        return Result.ok(views.of(orders.create(cmd)));
    }

    @PostMapping("/upload")
    public Result<Map<String, Object>> upload(@RequestPart("file") MultipartFile file,
                                             @RequestParam String bizType,
                                             @RequestParam long bizId) {
        belongCheck(bizId);
        Attachment a = uploads.save(file, bizType, bizId, Ctx.actorName());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("url", a.getStoragePath());
        return Result.ok(m);
    }

    private void belongCheck(long orderId) {
        long riderId = Ctx.require().getUserId();
        Order o = orders.require(orderId);
        if (o.getRiderId() == null || o.getRiderId() != riderId) {
            throw new BizException(403, "这单没派给你");
        }
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
    public static class RiderOrderReq {
        public String serviceType;
        public Map<String, Object> serviceDetails;
        public Long customerId;
        public Long addressId;
        public String address;
        public Long merchantId;
        public List<Long> merchantIds;
        public String goodsText;
        public Long goodsEstFen;
        public Long serviceFeeFen;
        public Boolean assignSelf;
    }
}
