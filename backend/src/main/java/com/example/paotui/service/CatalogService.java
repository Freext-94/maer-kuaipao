package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.entity.Address;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Goods;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.User;
import com.example.paotui.entity.ServiceType;
import com.example.paotui.mapper.AddressMapper;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.GoodsMapper;
import com.example.paotui.mapper.MerchantMapper;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.mapper.ServiceTypeMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 客户/商家/商品这些主数据，调度台和录单都要用。 */
@Service
@RequiredArgsConstructor
public class CatalogService {

    private final CustomerMapper customerMapper;
    private final AddressMapper addressMapper;
    private final MerchantMapper merchantMapper;
    private final GoodsMapper goodsMapper;
    private final UserMapper userMapper;
    private final AccountService accountService;
    private final ServiceTypeMapper serviceTypeMapper;

    public List<ServiceType> serviceTypes() {
        return serviceTypeMapper.selectList(Wrappers.<ServiceType>lambdaQuery().eq(ServiceType::getEnabled, 1).orderByAsc(ServiceType::getSortNo));
    }

    /** 各端下单共用的默认商品，由管理员在系统配置里维护，只展示已上架项。 */
    public List<Goods> defaultGoods() {
        return goodsMapper.selectList(Wrappers.<Goods>lambdaQuery()
                .eq(Goods::getOnSale, 1)
                .orderByAsc(Goods::getSortNo).orderByAsc(Goods::getId).last("LIMIT 100"));
    }

    @Transactional
    public Customer createCustomer(String name, String phone, String note) {
        if (phone == null || phone.isBlank()) {
            throw new BizException("新客户必须有手机号，否则下次找不到人");
        }
        User u = accountService.byPhone(phone);
        if (u == null) {
            u = accountService.createUser(phone, name, "", List.of("customer"));
        }
        Customer exist = customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getUserId, u.getId()));
        if (exist != null) {
            throw new BizException("手机号 " + phone + " 已经建过档案了");
        }
        Customer c = new Customer();
        c.setUserId(u.getId());
        c.setNote(note == null ? "" : note);
        c.setCreator(name);
        customerMapper.insert(c);
        return c;
    }

    public Customer requireCustomer(long customerId) {
        Customer c = customerMapper.selectById(customerId);
        if (c == null) {
            throw new BizException("客户不存在");
        }
        return c;
    }

    public Customer customerByUser(long userId) {
        return customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getUserId, userId));
    }

    public User userOf(Customer c) {
        return userMapper.selectById(c.getUserId());
    }

    public Address addAddress(long customerId, String address, boolean asDefault) {
        if (address == null || address.isBlank()) {
            throw new BizException("地址不能为空");
        }
        requireCustomer(customerId);
        Address a = new Address();
        a.setCustomerId(customerId);
        a.setAddress(address.trim());
        a.setIsDefault(asDefault || addressMapper.selectCount(
                Wrappers.<Address>lambdaQuery().eq(Address::getCustomerId, customerId)) == 0 ? 1 : 0);
        addressMapper.insert(a);
        return a;
    }

    public List<Address> addresses(long customerId) {
        return addressMapper.selectList(Wrappers.<Address>lambdaQuery()
                .eq(Address::getCustomerId, customerId).orderByDesc(Address::getIsDefault).orderByAsc(Address::getId));
    }

    public Address requireAddress(long customerId, Long addressId) {
        List<Address> list = addresses(customerId);
        if (list.isEmpty()) {
            return null;
        }
        if (addressId == null) {
            return list.get(0);
        }
        return list.stream().filter(a -> a.getId().equals(addressId)).findFirst()
                .orElseThrow(() -> new BizException("这个地址不属于该客户"));
    }

    public List<Customer> listCustomers() {
        return customerMapper.selectList(Wrappers.<Customer>lambdaQuery().orderByDesc(Customer::getId));
    }

    /**
     * 输入即搜：姓名、手机号、备注任一命中。手机号允许只输后四位。
     * 先把 id 捞出来再去重，避免 join 后分页错乱。
     */
    public List<Customer> searchCustomers(String q, int limit) {
        if (q == null || q.isBlank()) {
            return listCustomers();
        }
        String kw = q.trim();
        List<Long> userIds = userMapper.selectList(Wrappers.<User>lambdaQuery()
                        .select(User::getId)
                        .and(w -> w.like(User::getName, kw).or().like(User::getPhone, kw)))
                .stream().map(User::getId).toList();
        return customerMapper.selectList(Wrappers.<Customer>lambdaQuery()
                .and(w -> {
                    w.like(Customer::getNote, kw);
                    if (!userIds.isEmpty()) {
                        w.or().in(Customer::getUserId, userIds);
                    }
                })
                .orderByDesc(Customer::getId)
                .last("LIMIT " + Math.max(1, Math.min(limit, 50))));
    }

    public List<Merchant> listMerchants() {
        return merchantMapper.selectList(Wrappers.<Merchant>lambdaQuery().eq(Merchant::getStatus, "active"));
    }

    /** 商家输入即搜：店名、类目、电话。 */
    public List<Merchant> searchMerchants(String q, int limit) {
        if (q == null || q.isBlank()) {
            return listMerchants();
        }
        String kw = q.trim();
        return merchantMapper.selectList(Wrappers.<Merchant>lambdaQuery()
                .eq(Merchant::getStatus, "active")
                .and(w -> w.like(Merchant::getName, kw)
                        .or().like(Merchant::getCategory, kw)
                        .or().like(Merchant::getPhone, kw))
                .orderByAsc(Merchant::getName)
                .last("LIMIT " + Math.max(1, Math.min(limit, 50))));
    }

    public Merchant requireMerchant(long id) {
        Merchant m = merchantMapper.selectById(id);
        if (m == null) {
            throw new BizException("商家不存在");
        }
        return m;
    }

    public Merchant saveMerchant(Merchant m) {
        if (m.getName() == null || m.getName().isBlank()) {
            throw new BizException("店名必填");
        }
        if (m.getPrepTimeoutMin() == null) {
            m.setPrepTimeoutMin(10);
        }
        if (m.getStatus() == null) {
            m.setStatus("active");
        }
        if (m.getId() == null) {
            merchantMapper.insert(m);
        } else {
            merchantMapper.updateById(m);
        }
        return m;
    }
}
