package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.dto.OrderView;
import com.example.paotui.entity.Attachment;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.Order;
import com.example.paotui.entity.OrderItem;
import com.example.paotui.entity.OrderMerchant;
import com.example.paotui.entity.User;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.mapper.AttachmentMapper;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.MerchantMapper;
import com.example.paotui.mapper.OrderMapper;
import com.example.paotui.mapper.OrderMerchantMapper;
import com.example.paotui.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/** 把订单 + 派生金额 + 关联名字拼成前端要的样子。 */
@Service
@RequiredArgsConstructor
public class OrderViewService {

    private final OrderMapper orderMapper;
    private final OrderMerchantMapper orderMerchantMapper;
    private final OrderItemService items;
    private final CustomerMapper customerMapper;
    private final MerchantMapper merchantMapper;
    private final UserMapper userMapper;
    private final AttachmentMapper attachmentMapper;
    private final LedgerService ledger;
    private final OrderService orders;
    private final NotifyService notify;
    private final ObjectMapper json;

    public OrderView of(Order o) {
        OrderView v = new OrderView();
        v.setId(o.getId());
        v.setOrderNo(o.getOrderNo());
        v.setSource(o.getSource());
        v.setSourceChannel(o.getSourceChannel());
        v.setSourceChannelNote(o.getSourceChannelNote());
        v.setServiceType(o.getServiceType());
        v.setServiceTypeName(serviceTypeName(o.getServiceType()));
        try { v.setServiceDetails(o.getServiceDetails() == null ? java.util.Map.of() : json.readValue(o.getServiceDetails(), new com.fasterxml.jackson.core.type.TypeReference<>() {})); }
        catch (Exception ignored) { v.setServiceDetails(java.util.Map.of()); }
        v.setStatus(o.getStatus());
        v.setStatusLabel(OrderStatus.of(o.getStatus()).getLabel());
        v.setCustomerId(o.getCustomerId());
        v.setMerchantId(o.getMerchantId());
        v.setRiderId(o.getRiderId());
        v.setGoodsEstFen(o.getGoodsEstFen());
        v.setGoodsRealFen(o.getGoodsRealFen());
        v.setServiceFeeFen(o.getServiceFeeFen());
        v.setExtraFeeFen(o.getExtraFeeFen());
        v.setReceivableFen(orders.receivable(o));
        v.setPaidFen(ledger.paidOnOrder(o.getId()));
        v.setOwedFen(Math.max(0, v.getReceivableFen() - v.getPaidFen()));
        v.setAdjustmentsFen(ledger.adjustmentsOf(o.getId()));
        v.setCreateTime(o.getCreateTime());
        v.setPickedAt(o.getPickedAt());
        v.setDeliveredAt(o.getDeliveredAt());
        v.setFinishedAt(o.getFinishedAt());
        v.setCancelCode(o.getCancelCode());
        v.setCancelText(o.getCancelText());

        OrderItem it = items.one(o.getId());
        v.setGoodsText(it == null ? "" : it.getGoodsText());

        Customer c = customerMapper.selectById(o.getCustomerId());
        if (c != null) {
            User u = userMapper.selectById(c.getUserId());
            v.setCustomerName(u == null ? "" : u.getName());
            v.setCustomerPhone(u == null ? "" : u.getPhone());
            v.setCustomerOwedFen(ledger.balance(c.getId()));
        }
        if (o.getMerchantId() != null) {
            Merchant m = merchantMapper.selectById(o.getMerchantId());
            if (m != null) {
                v.setMerchantName(m.getName());
                v.setMerchantPhone(m.getPhone());
            }
        }
        v.setMerchantGroups(orderMerchantMapper.selectList(Wrappers.<OrderMerchant>lambdaQuery()
                .eq(OrderMerchant::getOrderId, o.getId()).orderByAsc(OrderMerchant::getId)).stream().map(group -> {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("merchantId", group.getMerchantId()); m.put("prepStatus", group.getPrepStatus());
            m.put("pickedGoodsFen", group.getPickedGoodsFen()); m.put("note", group.getNote());
            Merchant merchant = merchantMapper.selectById(group.getMerchantId());
            m.put("merchantName", merchant == null ? "" : merchant.getName());
            return m;
        }).toList());
        if (o.getRiderId() != null) {
            User r = userMapper.selectById(o.getRiderId());
            v.setRiderName(r == null ? "" : r.getName());
        }
        var advances = orders.advancesOf(o.getId());
        if (!advances.isEmpty()) {
            v.setAdvanceFen(advances.stream().mapToLong(a -> a.getAmountFen() == null ? 0 : a.getAmountFen()).sum());
            v.setAdvanceStatus(advances.stream().allMatch(a -> "settled".equals(a.getStatus())) ? "settled"
                    : advances.stream().anyMatch(a -> "loss".equals(a.getStatus())) ? "loss" : "paid");
        }
        v.setPolled(notify.wasPolled(o.getId()));
        v.setAddress(readAddress(o));
        v.setNote(o.getNote());
        v.setAttachments(attachments(o.getId()));
        return v;
    }

    public List<OrderView> list(List<Order> os) {
        return os.stream().map(this::of).toList();
    }

    public OrderView ofId(long orderId) {
        Order o = orderMapper.selectById(orderId);
        if (o == null) {
            throw new com.example.paotui.common.BizException("订单不存在");
        }
        return of(o);
    }

    @SuppressWarnings("unchecked")
    private OrderView.AddressSnap readAddress(Order o) {
        OrderView.AddressSnap snap = new OrderView.AddressSnap();
        try {
            if (o.getAddressSnapshot() == null || o.getAddressSnapshot().isBlank()) return snap;
            Map<String, Object> m = json.readValue(o.getAddressSnapshot(), Map.class);
            String address = (String) m.get("address");
            if (address != null && !address.isBlank()) {
                snap.setAddress(address);
                return snap;
            }
            // 历史单：把拆分字段折成一行，老订单照样显示
            StringBuilder sb = new StringBuilder();
            appendIfPresent(sb, m.get("contactName"));
            appendIfPresent(sb, m.get("contactPhone"));
            appendIfPresent(sb, m.get("poi"));
            appendIfPresent(sb, m.get("detail"));
            Object floor = m.get("floor");
            if (floor != null && !"0".equals(String.valueOf(floor))) appendIfPresent(sb, String.valueOf(floor) + "楼");
            if (Boolean.TRUE.equals(m.get("elevator")) || "1".equals(String.valueOf(m.get("elevator")))) appendIfPresent(sb, "有电梯");
            snap.setAddress(sb.toString());
        } catch (Exception e) {
            // 快照损坏就留空，不让整单打不开
        }
        return snap;
    }

    private void appendIfPresent(StringBuilder sb, Object v) {
        if (v == null) return;
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return;
        if (sb.length() > 0) sb.append(' ');
        sb.append(s);
    }

    private List<OrderView.AttachmentRef> attachments(long orderId) {
        return attachmentMapper.selectList(Wrappers.<Attachment>lambdaQuery()
                        .eq(Attachment::getBizId, orderId)
                        .in(Attachment::getBizType, "receipt", "delivered", "voucher", "order")
                        .orderByAsc(Attachment::getId))
                .stream().map(a -> {
                    OrderView.AttachmentRef r = new OrderView.AttachmentRef();
                    r.setId(a.getId());
                    r.setBizType(a.getBizType());
                    r.setUrl(a.getStoragePath());
                    r.setFileName(a.getFileName());
                    r.setContentType(a.getContentType());
                    return r;
                }).toList();
    }

    private String serviceTypeName(String code) {
        return switch (code == null ? "buy" : code) {
            case "buy" -> "代买";
            case "pickup" -> "代取送";
            case "errand" -> "代办";
            case "transfer" -> "接送";
            case "driver" -> "代驾";
            default -> code;
        };
    }
}
