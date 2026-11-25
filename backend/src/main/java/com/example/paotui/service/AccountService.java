package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.User;
import com.example.paotui.entity.UserRole;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.MerchantMapper;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.mapper.UserRoleMapper;
import com.example.paotui.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final MerchantMapper merchantMapper;
    private final CustomerMapper customerMapper;

    public User byPhone(String phone) {
        return userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getPhone, phone));
    }

    public void updateLoginAt(User user) { userMapper.updateById(user); }

    public User byId(Long id) {
        User u = userMapper.selectById(id);
        if (u == null) {
            throw new BizException("账号不存在");
        }
        return u;
    }

    /** 允许账号已被软删的场景（如历史客户档案），读不到就返回 null。 */
    public User nullableById(Long id) {
        return id == null ? null : userMapper.selectById(id);
    }

    /** 权限每次现取，改角色不用等会话过期。 */
    public Principal principal(Long userId) {
        User u = byId(userId);
        if (!"active".equals(u.getStatus())) {
            throw new BizException("这个账号已停用");
        }
        Principal p = new Principal();
        p.setUserId(u.getId());
        p.setName(u.getName());
        for (UserRole r : rolesOf(userId)) {
            p.getRoles().add(r.getRole());
            if ("merchant".equals(r.getRole()) && r.getScopeMerchantId() != null && r.getScopeMerchantId() > 0) {
                p.setScopeMerchantId(r.getScopeMerchantId());
            }
        }
        // 客户 scope：从 t_customer 反查
        Customer c = customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getUserId, userId));
        if (c != null) {
            p.setScopeCustomerId(c.getId());
        }
        return p;
    }

    public List<UserRole> rolesOf(Long userId) {
        return userRoleMapper.selectList(Wrappers.<UserRole>lambdaQuery().eq(UserRole::getUserId, userId));
    }

    public User createUser(String phone, String name, String passwordHash, List<String> roles) {
        if (phone == null || phone.isBlank()) {
            throw new BizException("手机号必填");
        }
        if (byPhone(phone) != null) {
            throw new BizException("手机号 " + phone + " 已存在");
        }
        User u = new User();
        u.setPhone(phone);
        u.setName(name == null ? "" : name);
        u.setPasswordHash(passwordHash == null ? "" : passwordHash);
        u.setStatus("active");
        userMapper.insert(u);
        for (String role : roles) {
            UserRole ur = new UserRole();
            ur.setUserId(u.getId());
            ur.setRole(role);
            ur.setScopeMerchantId(0L);
            userRoleMapper.insert(ur);
        }
        return u;
    }

    public List<User> listRiders() {
        List<Long> ids = userRoleMapper.selectList(
                Wrappers.<UserRole>lambdaQuery().eq(UserRole::getRole, "rider"))
                .stream().map(UserRole::getUserId).toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        return userMapper.selectList(Wrappers.<User>lambdaQuery().in(User::getId, ids).eq(User::getStatus, "active"));
    }

    /** 商家主账号：owner_user_id 或 scope 绑定的门店。 */
    public Merchant merchantOf(User u) {
        Merchant m = merchantMapper.selectOne(Wrappers.<Merchant>lambdaQuery().eq(Merchant::getOwnerUserId, u.getId()));
        if (m == null) {
            UserRole r = userRoleMapper.selectOne(Wrappers.<UserRole>lambdaQuery()
                    .eq(UserRole::getUserId, u.getId()).eq(UserRole::getRole, "merchant").last("LIMIT 1"));
            if (r != null && r.getScopeMerchantId() != null && r.getScopeMerchantId() > 0) {
                m = merchantMapper.selectById(r.getScopeMerchantId());
            }
        }
        return m;
    }
}
