package com.example.paotui.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class OrderCreateCmd {

    /** phone=老板接电话代录，online=客户自己下单 */
    @NotBlank
    private String source = "phone";

    /** 客户/商家联系渠道，可选：customer_call/customer_wechat/merchant_call/merchant_wechat/other */
    private String sourceChannel;
    private String sourceChannelNote;

    /** 服务类型码：buy/pickup/errand/transfer/driver，默认代买 */
    private String serviceType = "buy";

    private Long customerId;

    // 新客户当场建档用
    private String newCustomerName;
    private String newCustomerPhone;

    private Long merchantId;

    /** 代买可一次关联多个取货商家；merchantId 保留兼容旧客户端。 */
    private List<Long> merchantIds;

    /** 服务专属字段，按服务类型校验并作为订单快照保存。 */
    private Map<String, Object> serviceDetails;

    /** 已有地址；为空时用下面的新地址 */
    private Long addressId;
    /** 新地址，一行文本 */
    private String address;

    @NotBlank(message = "要买什么必须写清楚")
    private String goodsText;

    /** 货款估价（分） */
    @NotNull
    private Long goodsEstFen;

    @NotNull
    private Long serviceFeeFen;

    private Long extraFeeFen = 0L;

    /** 指派骑手，留空则停在待派单 */
    private Long riderId;

    private String note = "";

}
