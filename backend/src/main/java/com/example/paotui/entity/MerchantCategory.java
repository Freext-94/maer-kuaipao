package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("t_merchant_category")
public class MerchantCategory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String code;

    private String name;

    private Integer sortNo;

    private Integer enabled;
}
