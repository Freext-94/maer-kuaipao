package com.example.paotui.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.paotui.entity.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {
}
