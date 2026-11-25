package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.entity.OrderItem;
import com.example.paotui.mapper.OrderItemMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class OrderItemService {

    private final OrderItemMapper itemMapper;

    public OrderItem one(long orderId) {
        return itemMapper.selectOne(Wrappers.<OrderItem>lambdaQuery()
                .eq(OrderItem::getOrderId, orderId).orderByAsc(OrderItem::getId).last("LIMIT 1"));
    }

    public List<OrderItem> list(long orderId) {
        return itemMapper.selectList(Wrappers.<OrderItem>lambdaQuery()
                .eq(OrderItem::getOrderId, orderId).orderByAsc(OrderItem::getId));
    }
}
