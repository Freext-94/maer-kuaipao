package com.example.paotui.enums;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * 订单状态机（v2，简化版）。
 * 流程：下单/录单 → 待派单 → 指派骑手 → 取货中 → 取到货 → 派送中 → 点「确认送达」并收款 → 完成/挂账。
 * 去掉了「待备货/备货完成」两个中间态（商家端不再单独备货），
 * 并把「已送达」和「结单收款」合并成「配送完成」一个动作。
 */
public enum OrderStatus {

    PENDING("待派单"),
    PICKING("取货中"),
    DELIVERING("派送中"),
    FINISHED("已完成"),
    CANCELLED("已取消");

    public static final Map<OrderStatus, Set<OrderStatus>> TRANSITIONS;

    static {
        Map<OrderStatus, Set<OrderStatus>> m = new EnumMap<>(OrderStatus.class);
        m.put(PENDING, Collections.unmodifiableSet(EnumSet.of(PICKING, CANCELLED)));
        m.put(PICKING, Collections.unmodifiableSet(EnumSet.of(DELIVERING, CANCELLED)));
        m.put(DELIVERING, Collections.unmodifiableSet(EnumSet.of(FINISHED, CANCELLED)));
        m.put(FINISHED, Collections.unmodifiableSet(EnumSet.noneOf(OrderStatus.class)));
        m.put(CANCELLED, Collections.unmodifiableSet(EnumSet.noneOf(OrderStatus.class)));
        TRANSITIONS = Collections.unmodifiableMap(m);
    }

    private final String label;

    OrderStatus(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public String code() {
        return name();
    }

    public boolean canMoveTo(OrderStatus target) {
        if (target == null) {
            return false;
        }
        return TRANSITIONS.getOrDefault(this, Collections.emptySet()).contains(target);
    }

    public boolean isTerminal() {
        return this == FINISHED || this == CANCELLED;
    }

    public static OrderStatus of(String code) {
        for (OrderStatus s : values()) {
            if (s.name().equals(code)) {
                return s;
            }
        }
        // 兼容旧状态码（万一有历史数据没迁干净），映射到最接近的新状态
        switch (code) {
            case "PENDING_DISPATCH": return PENDING;
            case "PENDING_PREP":
            case "READY_FOR_PICKUP": return PICKING;
            case "PICKED_UP":
            case "DELIVERED": return DELIVERING;
            default: throw new IllegalArgumentException("未知订单状态: " + code);
        }
    }
}
