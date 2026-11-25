package com.example.paotui.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.dto.OrderCreateCmd;
import com.example.paotui.dto.OrderView;
import com.example.paotui.entity.Address;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Goods;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.Order;
import com.example.paotui.entity.User;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.mapper.AddressMapper;
import com.example.paotui.mapper.OrderMapper;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.mapper.CustomerRepayRequestMapper;
import com.example.paotui.entity.CustomerRepayRequest;
import com.example.paotui.security.Ctx;
import com.example.paotui.service.CatalogService;
import com.example.paotui.service.LedgerService;
import com.example.paotui.service.OrderService;
import com.example.paotui.service.OrderViewService;
import com.example.paotui.service.SettingService;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 客户端 H5 自助下单。客户可申报线下还款，由管理员核对到账后记入正式账本。
 */
@RestController
@RequestMapping("/api/c")
@RequiredArgsConstructor
public class CustomerController {

    private static final long FALLBACK_FEE_FEN = 1000;

    private final CatalogService catalog;
    private final OrderService orders;
    private final OrderViewService views;
    private final LedgerService ledger;
    private final OrderMapper orderMapper;
    private final UserMapper userMapper;
    private final CustomerRepayRequestMapper repayRequests;
    private final AddressMapper addressMapper;
    private final SettingService settings;

    @GetMapping("/profile")
    public Result<Map<String, Object>> profile() {
        Customer c = me();
        User u = catalog.userOf(c);
        long owed = ledger.balance(c.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("customerId", c.getId());
        out.put("name", u.getName());
        out.put("phone", u.getPhone());
        out.put("owedFen", Math.max(0, owed));
        out.put("prepaidFen", owed < 0 ? -owed : 0);
        out.put("addresses", catalog.addresses(c.getId()));
        out.put("merchants", catalog.listMerchants());
        out.put("defaultFeeFen", defaultFeeFen());
        out.put("serviceTypes", catalog.serviceTypes());
        out.put("defaultGoods", defaultGoods());
        return Result.ok(out);
    }

    /** 客户只能改手机号；称呼和备注由管理员在后台维护。 */
    @PostMapping("/profile")
    public Result<Map<String, Object>> updateProfile(@RequestBody ProfileReq req) {
        Customer c = me();
        User u = catalog.userOf(c);
        if (req.phone != null && !req.phone.isBlank()) {
            String phone = req.phone.trim();
            if (!phone.matches("1\\d{10}")) {
                throw new BizException("手机号要 11 位");
            }
            Long same = userMapper.selectCount(Wrappers.<User>lambdaQuery()
                    .eq(User::getPhone, phone).ne(User::getId, u.getId()));
            if (same != null && same > 0) {
                throw new BizException("这个手机号已经被别的账号用了");
            }
            u.setPhone(phone);
        }
        userMapper.updateById(u);
        return Result.ok(Map.of("name", u.getName(), "phone", u.getPhone()));
    }

    @GetMapping("/default-goods")
    public Result<List<Goods>> defaultGoodsApi() {
        return Result.ok(defaultGoods());
    }

    @PostMapping("/addresses")
    public Result<Address> addAddress(@RequestBody AddressReq req) {
        Customer c = me();
        Address a = new Address();
        a.setCustomerId(c.getId());
        fillAddress(a, req);
        if (a.getIsDefault() == null) {
            a.setIsDefault(addressMapper.selectCount(Wrappers.<Address>lambdaQuery()
                    .eq(Address::getCustomerId, c.getId()).eq(Address::getIsDefault, 1)) == 0 ? 1 : 0);
        }
        addressMapper.insert(a);
        return Result.ok(a);
    }

    @PutMapping("/addresses/{id}")
    public Result<Address> updateAddress(@PathVariable long id, @RequestBody AddressReq req) {
        Customer c = me();
        Address a = addressMapper.selectById(id);
        if (a == null || !c.getId().equals(a.getCustomerId())) {
            throw new BizException("地址不存在");
        }
        fillAddress(a, req);
        addressMapper.updateById(a);
        return Result.ok(a);
    }

    private void fillAddress(Address a, AddressReq req) {
        if (req.address == null || req.address.isBlank()) {
            throw new BizException("地址不能为空");
        }
        a.setAddress(req.address.trim());
        if (req.isDefault != null) {
            a.setIsDefault(req.isDefault ? 1 : 0);
        }
    }

    private long defaultFeeFen() {
        return Math.max(0, settings.getLong("default_service_fee_fen", FALLBACK_FEE_FEN));
    }

    private long feeForService(String code) {
        for (com.example.paotui.entity.ServiceType t : catalog.serviceTypes()) {
            if (t.getCode().equals(code) && t.getBaseFeeFen() != null) {
                return Math.max(0, t.getBaseFeeFen());
            }
        }
        return defaultFeeFen();
    }

    private List<Goods> defaultGoods() {
        return catalog.defaultGoods();
    }

    @PostMapping("/orders")
    public Result<OrderView> create(@Valid @RequestBody ClientOrderReq req) {
        Customer c = me();
        Address addr = catalog.requireAddress(c.getId(), req.addressId);
        if (addr == null) {
            throw new BizException("请先让老板帮你加一个收货地址");
        }
        OrderCreateCmd cmd = new OrderCreateCmd();
        cmd.setSource("online");
        cmd.setCustomerId(c.getId());
        cmd.setAddressId(addr.getId());
        cmd.setMerchantId(req.merchantId);
        cmd.setMerchantIds(req.merchantIds);
        cmd.setServiceType(req.serviceType == null ? "buy" : req.serviceType);
        cmd.setServiceDetails(req.serviceDetails);
        cmd.setGoodsText(req.goodsText);
        cmd.setGoodsEstFen(req.goodsEstFen);
        cmd.setServiceFeeFen(req.serviceFeeFen == null
                ? feeForService(cmd.getServiceType()) : req.serviceFeeFen);
        return Result.ok(views.of(orders.create(cmd)));
    }

    @GetMapping("/orders")
    public Result<List<OrderView>> myOrders() {
        Customer c = me();
        List<Order> list = orderMapper.selectList(Wrappers.<Order>lambdaQuery()
                .eq(Order::getCustomerId, c.getId())
                .orderByDesc(Order::getId).last("LIMIT 50"));
        return Result.ok(views.list(list.stream()
                .filter(o -> !OrderStatus.CANCELLED.name().equals(o.getStatus())).toList()));
    }

    @PostMapping("/repay")
    public Result<Map<String, Object>> repay(@RequestBody RepayReq req) {
        Customer c = me();
        long amount = req.amountFen == null ? 0L : req.amountFen;
        long owed = Math.max(0, ledger.balance(c.getId()));
        if (amount <= 0 || amount > owed) throw new BizException("申报金额必须大于 0 且不能超过当前欠款");
        if (req.method == null || !List.of("微信收款码", "现金", "支付宝").contains(req.method.trim())) {
            throw new BizException("请选择有效的还款方式");
        }
        Long pending = repayRequests.selectCount(Wrappers.<CustomerRepayRequest>lambdaQuery()
                .eq(CustomerRepayRequest::getCustomerId, c.getId())
                .eq(CustomerRepayRequest::getStatus, "pending"));
        if (pending != null && pending > 0) throw new BizException("已有一笔还款待老板核对，请勿重复提交");
        CustomerRepayRequest request = new CustomerRepayRequest();
        request.setCustomerId(c.getId()); request.setAmountFen(amount);
        request.setMethod(req.method == null ? "" : req.method.trim()); request.setStatus("pending");
        repayRequests.insert(request);
        return Result.ok(Map.of("requestId", request.getId(), "owedFen", owed, "status", "pending"));
    }

    /** 客户自己的账单：按月生成（挂账/收款/冲正/减免）+ 当前欠款。 */
    @GetMapping("/ledger")
    public Result<Map<String, Object>> myLedger() {
        Customer c = me();
        List<com.example.paotui.entity.LedgerEntry> entries = ledger.entriesOf(c.getId());
        List<com.example.paotui.entity.LedgerEntry> newestFirst = new java.util.ArrayList<>(entries);
        java.util.Collections.reverse(newestFirst);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("owedFen", ledger.balance(c.getId()));
        out.put("prepaidFen", ledger.prepaidOf(c.getId()));
        out.put("entries", newestFirst.stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("type", e.getType());
            m.put("amountFen", e.getAmountFen());
            m.put("method", e.getMethod());
            m.put("note", e.getNote());
            m.put("occurredAt", e.getOccurredAt());
            m.put("periodMonth", e.getPeriodMonth());
            m.put("orderNo", e.getOrderId() == null ? "" : orderNo(e.getOrderId()));
            return m;
        }).toList());
        out.put("months", monthlyBills(newestFirst));
        return Result.ok(out);
    }

    /** 按 periodMonth 归集，前端直接渲染「某月账单」。 */
    private List<Map<String, Object>> monthlyBills(List<com.example.paotui.entity.LedgerEntry> newestFirst) {
        Map<String, List<com.example.paotui.entity.LedgerEntry>> grouped = new java.util.TreeMap<>(java.util.Comparator.reverseOrder());
        for (com.example.paotui.entity.LedgerEntry e : newestFirst) {
            String month = e.getPeriodMonth();
            if (month == null || month.isBlank()) {
                month = e.getOccurredAt() == null ? "" : java.time.YearMonth.from(e.getOccurredAt()).toString();
            }
            grouped.computeIfAbsent(month, k -> new java.util.ArrayList<>()).add(e);
        }
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, List<com.example.paotui.entity.LedgerEntry>> en : grouped.entrySet()) {
            long charge = 0, paid = 0, adjust = 0, net = 0;
            java.util.Set<Long> orderIds = new java.util.LinkedHashSet<>();
            for (com.example.paotui.entity.LedgerEntry e : en.getValue()) {
                long amt = e.getAmountFen() == null ? 0 : e.getAmountFen();
                net += amt;
                if ("PAYMENT".equals(e.getType())) paid += Math.abs(amt);
                else if ("ADJUST".equals(e.getType()) || "WAIVE".equals(e.getType())) adjust += amt;
                else charge += amt;
                if (e.getOrderId() != null) orderIds.add(e.getOrderId());
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("month", en.getKey());
            m.put("chargeFen", charge);
            m.put("paidFen", paid);
            m.put("adjustFen", adjust);
            m.put("netFen", net);
            m.put("count", en.getValue().size());
            // 当月相关订单：本月流水关联到的订单（排除已取消），供账单详情展示
            List<Order> monthOrders = orderIds.isEmpty() ? List.of()
                    : orderMapper.selectBatchIds(orderIds).stream()
                        .filter(o -> !OrderStatus.CANCELLED.name().equals(o.getStatus())).toList();
            m.put("orders", views.list(monthOrders));
            out.add(m);
        }
        return out;
    }

    private String orderNo(Long orderId) {
        if (orderId == null) {
            return "";
        }
        Order o = orderMapper.selectById(orderId);
        return o == null ? "" : o.getOrderNo();
    }

    private Customer me() {
        Long id = Ctx.require().getScopeCustomerId();
        return catalog.requireCustomer(id);
    }

    @Data
    public static class ClientOrderReq {
        public String serviceType;
        public Map<String, Object> serviceDetails;
        public Long merchantId;
        public List<Long> merchantIds;
        public String goodsText;
        public Long goodsEstFen;
        public Long serviceFeeFen;
        public Long addressId;
    }

    @Data
    public static class RepayReq {
        public Long amountFen;
        public String method;
    }

    @Data
    public static class ProfileReq {
        public String phone;
    }

    @Data
    public static class AddressReq {
        public String address;
        public Boolean isDefault;
    }
}
