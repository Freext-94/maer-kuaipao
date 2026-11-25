package com.example.paotui.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.paotui.entity.Customer;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CustomerMapper extends BaseMapper<Customer> {
}
