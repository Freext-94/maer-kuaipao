package com.example.paotui.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.paotui.entity.Order;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OrderMapper extends BaseMapper<Order> {
}
