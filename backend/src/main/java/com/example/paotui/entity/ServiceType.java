package com.example.paotui.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("t_service_type")
public class ServiceType {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String code;

    private String name;

    private String iconPath;

    private String flowKind;

    /** 该类服务的基础服务费（分）；界面按业务显示为跑腿费/代办费/代驾费等。 */
    private Long baseFeeFen;

    private String formSchema;

    private Integer sortNo;

    private Integer enabled;
}
