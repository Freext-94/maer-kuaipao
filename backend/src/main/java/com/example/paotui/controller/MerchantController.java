package com.example.paotui.controller;

import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.dto.OrderView;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.Order;
import com.example.paotui.entity.User;
import com.example.paotui.mapper.MerchantMapper;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.security.Ctx;
import com.example.paotui.service.AccountService;
import com.example.paotui.service.OrderService;
import com.example.paotui.service.OrderViewService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 商家端。商家用手机号登录，只看自己参与的单（待完成/已完成）。
 * poll 是待完成订单的主路径（声音提醒 + 页面挂机）。
 */
@RestController
@RequestMapping("/api/m")
@RequiredArgsConstructor
public class MerchantController {

    private final OrderService orders;
    private final OrderViewService views;
    private final MerchantMapper merchantMapper;
    private final UserMapper userMapper;
    private final AccountService accounts;

    /** 兼容老数据：优先用角色作用域，没有就按 owner_user_id 找本店。 */
    private Merchant currentMerchant() {
        Long scope = Ctx.require().getScopeMerchantId();
        if (scope != null && scope > 0) {
            Merchant m = merchantMapper.selectById(scope);
            if (m != null) return m;
        }
        User u = userMapper.selectById(Ctx.require().getUserId());
        Merchant m = u == null ? null : accounts.merchantOf(u);
        if (m == null) throw new BizException("当前账号没有绑定商家，请联系管理员");
        return m;
    }

    @GetMapping("/poll")
    public Result<Map<String, Object>> poll() {
        long merchantId = currentMerchant().getId();
        var pending = orders.pendingForMerchant(merchantId);
        List<OrderView> list = views.list(pending);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("serverTime", System.currentTimeMillis());
        out.put("pending", list);
        out.put("count", list.size());
        return Result.ok(out);
    }

    /** 商家参与的所有单（不限今天）：待完成 + 已完成/取消。 */
    @GetMapping("/orders")
    public Result<Map<String, Object>> ordersList() {
        long merchantId = currentMerchant().getId();
        List<Order> all = orders.list(null, null, null, merchantId, null, 200);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("waiting", views.list(all.stream().filter(o -> !"FINISHED".equals(o.getStatus())
                && !"CANCELLED".equals(o.getStatus())).toList()));
        out.put("done", views.list(all.stream().filter(o -> "FINISHED".equals(o.getStatus())
                || "CANCELLED".equals(o.getStatus())).toList()));
        return Result.ok(out);
    }
}
