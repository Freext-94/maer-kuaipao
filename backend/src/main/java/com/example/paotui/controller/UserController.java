package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.entity.Address;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.MerchantCategory;
import com.example.paotui.entity.Permission;
import com.example.paotui.entity.User;
import com.example.paotui.entity.UserRole;
import com.example.paotui.mapper.AddressMapper;
import com.example.paotui.mapper.CustomerMapper;
import com.example.paotui.mapper.MerchantCategoryMapper;
import com.example.paotui.mapper.MerchantCategoryRelMapper;
import com.example.paotui.mapper.MerchantMapper;
import com.example.paotui.mapper.PermissionMapper;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.mapper.UserRoleMapper;
import com.example.paotui.service.AccountService;
import com.example.paotui.security.Ctx;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户与权限管理。B2 起商家也在这一处管理：勾"商家"角色必填类目。
 * 一期只做超管/管理员两级，不预设调度员、财务。
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class UserController {

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final PermissionMapper permissionMapper;
    private final MerchantMapper merchantMapper;
    private final CustomerMapper customerMapper;
    private final AddressMapper addressMapper;
    private final MerchantCategoryMapper categoryMapper;
    private final MerchantCategoryRelMapper categoryRelMapper;
    private final AccountService accounts;
    private final PasswordEncoder encoder;
    private final JdbcTemplate jdbc;

    private static final Set<String> ROLE_SET = Set.of("super_admin", "admin", "rider", "merchant", "customer");

    // -------------------------------------------------- 用户

    @GetMapping("/users")
    @RequirePerm("user.manage")
    public Result<List<Map<String, Object>>> list() {
        boolean superAdmin = Ctx.require().getRoles().contains("super_admin");
        return Result.ok(userMapper.selectList(Wrappers.<User>lambdaQuery().orderByAsc(User::getId)).stream()
                .filter(u -> superAdmin || accounts.rolesOf(u.getId()).stream().noneMatch(r -> "admin".equals(r.getRole()) || "super_admin".equals(r.getRole())))
                .map(this::toMap).toList());
    }

    private Map<String, Object> toMap(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("phone", u.getPhone());
        m.put("name", u.getName());
        m.put("status", u.getStatus());
        m.put("remark", u.getRemark());
        m.put("lastLoginAt", u.getLastLoginAt());
        m.put("roles", accounts.rolesOf(u.getId()).stream().map(UserRole::getRole).toList());
        Merchant mer = accounts.merchantOf(u);
        if (mer != null) {
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("id", mer.getId());
            mm.put("name", mer.getName());
            mm.put("status", mer.getStatus());
            mm.put("phone", mer.getPhone());
            mm.put("categories", categoryCodes(mer.getId()));
            m.put("merchant", mm);
        }
        Customer customer = customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getUserId, u.getId()));
        if (customer != null) {
            m.put("customerId", customer.getId());
            m.put("customerNote", customer.getNote());
            Address addr = addressMapper.selectOne(Wrappers.<Address>lambdaQuery()
                    .eq(Address::getCustomerId, customer.getId())
                    .orderByDesc(Address::getIsDefault).orderByAsc(Address::getId).last("LIMIT 1"));
            m.put("customerAddress", addr == null ? "" : addr.getAddress());
        }
        return m;
    }

    private List<String> categoryCodes(long merchantId) {
        List<Long> ids = categoryRelMapper.selectList(Wrappers.<com.example.paotui.entity.MerchantCategoryRel>lambdaQuery()
                .eq(com.example.paotui.entity.MerchantCategoryRel::getMerchantId, merchantId))
                .stream().map(com.example.paotui.entity.MerchantCategoryRel::getCategoryId).toList();
        if (ids.isEmpty()) return List.of();
        return categoryMapper.selectList(Wrappers.<MerchantCategory>lambdaQuery().in(MerchantCategory::getId, ids))
                .stream().map(MerchantCategory::getCode).toList();
    }

    @PostMapping("/users")
    @RequirePerm("user.manage")
    public Result<Map<String, Object>> create(@RequestBody UserSaveReq req) {
        if (req.name == null || req.name.isBlank()) {
            throw new BizException("称呼必填");
        }
        if (req.phone == null || !req.phone.matches("1\\d{10}")) {
            throw new BizException("手机号要填 11 位");
        }
        if (req.password == null || req.password.isBlank()) {
            throw new BizException("要设一个初始密码");
        }
        List<String> roles = normalizeRoles(req.roles);
        if (roles.contains("super_admin") && !Ctx.require().getRoles().contains("super_admin")) throw new BizException(403, "只有超级管理员可以创建超级管理员");
        if (roles.contains("admin") && !Ctx.require().getRoles().contains("super_admin")) throw new BizException(403, "只有超级管理员可以创建管理员");
        User u = accounts.createUser(req.phone, req.name, encoder.encode(req.password), roles);
        if (roles.contains("customer")) {
            bindCustomer(u, req.customerNote, req.customerAddress);
        }
        if (req.merchant != null && roles.contains("merchant")) {
            bindMerchant(u, req.merchant);
        }
        return Result.ok(toMap(u));
    }

    @PutMapping("/users/{id}")
    @RequirePerm("user.manage")
    public Result<Map<String, Object>> update(@PathVariable long id, @RequestBody UserSaveReq req) {
        User u = accounts.byId(id);
        boolean superAdmin = Ctx.require().getRoles().contains("super_admin");
        boolean targetAdmin = accounts.rolesOf(id).stream().anyMatch(r -> "admin".equals(r.getRole()) || "super_admin".equals(r.getRole()));
        if (targetAdmin && !superAdmin) throw new BizException(403, "管理员账号只能由超级管理员维护");
        if (req.name != null && !req.name.isBlank()) {
            u.setName(req.name);
        }
        if (req.status != null && !req.status.isBlank()) {
            if ("disabled".equals(req.status) && id == 1) {
                throw new BizException("初始超级管理员不能停用");
            }
            u.setStatus(req.status);
        }
        if (req.roles != null) {
            List<String> roles = normalizeRoles(req.roles);
            if ((roles.contains("super_admin") || roles.contains("admin")) && !Ctx.require().getRoles().contains("super_admin")) throw new BizException(403, "只有超级管理员可以调整管理员权限");
            if (id == 1 && !roles.contains("admin")) {
                throw new BizException("初始超级管理员不能降级");
            }
            userRoleMapper.delete(Wrappers.<UserRole>lambdaQuery().eq(UserRole::getUserId, id));
            for (String role : roles) {
                UserRole ur = new UserRole();
                ur.setUserId(id);
                ur.setRole(role);
                ur.setScopeMerchantId(0L);
                userRoleMapper.insert(ur);
            }
            if (roles.contains("customer")) {
                bindCustomer(u, req.customerNote, req.customerAddress);
            }
            if (req.merchant != null && roles.contains("merchant")) {
                bindMerchant(u, req.merchant);
            }
        }
        userMapper.updateById(u);
        return Result.ok(toMap(u));
    }

    @DeleteMapping("/users/{id}")
    @RequirePerm("user.manage")
    public Result<Void> remove(@PathVariable long id) {
        if (id == 1) {
            throw new BizException("初始超级管理员不能删除");
        }
        if (Ctx.require().getUserId() != null && Ctx.require().getUserId() == id) {
            throw new BizException("不能删除当前登录账号");
        }
        boolean superAdmin = Ctx.require().getRoles().contains("super_admin");
        boolean targetAdmin = accounts.rolesOf(id).stream().anyMatch(r -> "admin".equals(r.getRole()) || "super_admin".equals(r.getRole()));
        if (targetAdmin && !superAdmin) throw new BizException(403, "管理员账号只能由超级管理员维护");
        // 有订单/流水的客户档案不能删，避免历史单据变成孤儿；提示改用停用
        Customer customer = customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getUserId, id));
        if (customer != null) {
            Long orders = jdbc.queryForObject("SELECT COUNT(*) FROM t_order WHERE customer_id=?", Long.class, customer.getId());
            Long ledger = jdbc.queryForObject("SELECT COUNT(*) FROM t_ledger_entry WHERE customer_id=?", Long.class, customer.getId());
            if ((orders != null && orders > 0) || (ledger != null && ledger > 0)) {
                throw new BizException("该客户已有订单或流水，不能删除；请改用停用");
            }
            customerMapper.deleteById(customer.getId());
        }
        userRoleMapper.delete(Wrappers.<UserRole>lambdaQuery().eq(UserRole::getUserId, id));
        userMapper.deleteById(id);
        return Result.ok();
    }

    @PostMapping("/users/{id}/reset-password")
    @RequirePerm("user.manage")
    public Result<Void> resetPassword(@PathVariable long id, @RequestBody ResetPwdReq req) {
        if (req.password == null || req.password.isBlank()) {
            throw new BizException("要填新密码");
        }
        User u = accounts.byId(id);
        if (!Ctx.require().getRoles().contains("super_admin") && accounts.rolesOf(id).stream().anyMatch(r -> "admin".equals(r.getRole()) || "super_admin".equals(r.getRole()))) throw new BizException(403, "管理员账号只能由超级管理员维护");
        u.setPasswordHash(encoder.encode(req.password));
        userMapper.updateById(u);
        return Result.ok();
    }

    // -------------------------------------------------- 权限矩阵

    @GetMapping("/permissions")
    @RequirePerm("user.manage")
    public Result<List<Map<String, Object>>> permissions() {
        Map<String, List<Permission>> byGroup = permissionMapper.selectList(
                Wrappers.<Permission>lambdaQuery().orderByAsc(Permission::getSortNo))
                .stream().collect(Collectors.groupingBy(Permission::getGrp, LinkedHashMap::new, Collectors.toList()));
        List<Map<String, Object>> out = new ArrayList<>();
        byGroup.forEach((grp, list) -> {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("grp", grp);
            g.put("items", list.stream().map(p -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", p.getId());
                m.put("code", p.getCode());
                m.put("name", p.getName());
                return m;
            }).toList());
            out.add(g);
        });
        return Result.ok(out);
    }

    /** admin 角色当前的权限集合（超管管理矩阵用）。 */
    @GetMapping("/permissions/granted")
    @RequirePerm("user.manage")
    public Result<List<Long>> granted(@org.springframework.web.bind.annotation.RequestParam(required = false, defaultValue = "admin") String role) {
        return Result.ok(jdbc.query("SELECT permission_id FROM t_role_permission WHERE role=? ORDER BY permission_id",
                (rs, row) -> rs.getLong(1), role));
    }

    @org.springframework.web.bind.annotation.PutMapping("/permissions/granted")
    @RequirePerm("user.manage")
    public Result<List<Long>> saveGranted(@org.springframework.web.bind.annotation.RequestParam(defaultValue = "admin") String role,
                                           @RequestBody List<Long> permissionIds) {
        if (!Ctx.require().getRoles().contains("super_admin")) throw new BizException(403, "只有超级管理员可以调整角色权限");
        if (!"admin".equals(role)) throw new BizException("当前只支持配置管理员角色权限");
        if (permissionIds == null || permissionIds.stream().anyMatch(id -> id == null || permissionMapper.selectById(id) == null)) throw new BizException("权限列表包含无效项");
        jdbc.update("DELETE FROM t_role_permission WHERE role=?", role);
        for (Long id : permissionIds.stream().distinct().toList()) {
            jdbc.update("INSERT INTO t_role_permission(role, permission_id) VALUES (?, ?)", role, id);
        }
        return granted(role);
    }

    // -------------------------------------------------- 类目（词条维护仅超级管理员）

    @GetMapping("/merchant-categories")
    @RequirePerm("NONE")
    public Result<List<MerchantCategory>> categories() {
        return Result.ok(categoryMapper.selectList(Wrappers.<MerchantCategory>lambdaQuery()
                .orderByAsc(MerchantCategory::getSortNo)));
    }

    @PostMapping("/merchant-categories")
    @RequirePerm("merchant.manage")
    public Result<MerchantCategory> createCategory(@RequestBody MerchantCategory c) {
        requireCategoryAdmin();
        normalizeCategory(c);
        if (duplicateCode(c.getCode(), null)) throw new BizException("类目码已存在");
        categoryMapper.insert(c);
        return Result.ok(c);
    }

    @PutMapping("/merchant-categories/{id}")
    @RequirePerm("merchant.manage")
    public Result<MerchantCategory> updateCategory(@PathVariable Long id, @RequestBody MerchantCategory c) {
        requireCategoryAdmin();
        if (categoryMapper.selectById(id) == null) throw new BizException("类目不存在");
        normalizeCategory(c);
        if (duplicateCode(c.getCode(), id)) throw new BizException("类目码已存在");
        c.setId(id);
        categoryMapper.updateById(c);
        return Result.ok(c);
    }

    @DeleteMapping("/merchant-categories/{id}")
    @RequirePerm("merchant.manage")
    public Result<Void> deleteCategory(@PathVariable Long id) {
        requireCategoryAdmin();
        if (categoryMapper.selectById(id) == null) throw new BizException("类目不存在");
        categoryRelMapper.delete(Wrappers.<com.example.paotui.entity.MerchantCategoryRel>lambdaQuery()
                .eq(com.example.paotui.entity.MerchantCategoryRel::getCategoryId, id));
        categoryMapper.deleteById(id);
        return Result.ok();
    }

    private void requireCategoryAdmin() {
        if (!Ctx.require().getRoles().contains("super_admin")) {
            throw new BizException(403, "只有超级管理员可以维护商家类目");
        }
    }

    private void normalizeCategory(MerchantCategory c) {
        if (c.getName() == null || c.getName().isBlank()) throw new BizException("类目名必填");
        if (c.getCode() == null || c.getCode().isBlank()) throw new BizException("类目码必填");
        String code = c.getCode().trim();
        if (!code.matches("[a-z][a-z0-9_]*")) {
            throw new BizException("类目码只能用小写英文字母、数字和下划线，且以字母开头（例：coffee）");
        }
        c.setCode(code);
        c.setName(c.getName().trim());
        if (c.getSortNo() == null) c.setSortNo(0);
        if (c.getEnabled() == null) c.setEnabled(1);
    }

    private boolean duplicateCode(String code, Long excludeId) {
        return categoryMapper.selectCount(Wrappers.<MerchantCategory>lambdaQuery()
                .eq(MerchantCategory::getCode, code)
                .ne(excludeId != null, MerchantCategory::getId, excludeId)) > 0;
    }

    // -------------------------------------------------- 工具

    private List<String> normalizeRoles(List<String> roles) {
        List<String> out = new ArrayList<>();
        for (String r : roles == null ? List.<String>of() : roles) {
            if (ROLE_SET.contains(r) && !out.contains(r)) {
                out.add(r);
            }
        }
        if (out.isEmpty()) {
            out.add("customer");
        }
        return out;
    }

    /** 角色含 customer 时同步客户档案，保证用户管理与录单选客户是同一份数据。 */
    private void bindCustomer(User u, String note, String address) {
        Customer c = customerMapper.selectOne(Wrappers.<Customer>lambdaQuery().eq(Customer::getUserId, u.getId()));
        if (c == null) {
            c = new Customer();
            c.setUserId(u.getId());
            c.setNote(note == null ? "" : note);
            c.setCreator(Ctx.actorName());
            customerMapper.insert(c);
        } else if (note != null) {
            c.setNote(note);
            customerMapper.updateById(c);
        }
        if (address != null && !address.isBlank()) {
            Address a = addressMapper.selectOne(Wrappers.<Address>lambdaQuery()
                    .eq(Address::getCustomerId, c.getId())
                    .orderByDesc(Address::getIsDefault).orderByAsc(Address::getId).last("LIMIT 1"));
            if (a == null) {
                a = new Address();
                a.setCustomerId(c.getId());
                a.setIsDefault(1);
                a.setCreator(Ctx.actorName());
                a.setAddress(address.trim());
                addressMapper.insert(a);
            } else {
                a.setAddress(address.trim());
                addressMapper.updateById(a);
            }
        }
    }

    private void bindMerchant(User u, MerchantReq req) {
        if (req.name == null || req.name.isBlank()) {
            throw new BizException("商家角色必须填店名");
        }
        if (req.categories == null || req.categories.isEmpty()) {
            throw new BizException("商家角色至少选一个类目");
        }
        Merchant m = accounts.merchantOf(u);
        if (m == null) {
            m = new Merchant();
            m.setName(req.name);
            m.setPhone(req.phone == null ? u.getPhone() : req.phone);
            m.setAddress(req.address == null ? "" : req.address);
            m.setStatus("active");
            m.setSource("user");
            m.setOwnerUserId(u.getId());
            m.setExtraJson(req.extra == null ? null : req.extra);
            merchantMapper.insert(m);
        } else {
            m.setName(req.name);
            if (req.phone != null) m.setPhone(req.phone);
            if (req.address != null) m.setAddress(req.address);
            merchantMapper.updateById(m);
        }
        // scope 绑定
        UserRole r = userRoleMapper.selectOne(Wrappers.<UserRole>lambdaQuery()
                .eq(UserRole::getUserId, u.getId()).eq(UserRole::getRole, "merchant").last("LIMIT 1"));
        if (r != null) {
            r.setScopeMerchantId(m.getId());
            userRoleMapper.updateById(r);
        }
        categoryRelMapper.delete(Wrappers.<com.example.paotui.entity.MerchantCategoryRel>lambdaQuery()
                .eq(com.example.paotui.entity.MerchantCategoryRel::getMerchantId, m.getId()));
        for (String code : req.categories) {
            MerchantCategory c = categoryMapper.selectOne(Wrappers.<MerchantCategory>lambdaQuery().eq(MerchantCategory::getCode, code));
            if (c == null) throw new BizException("商家类目不存在：" + code);
            com.example.paotui.entity.MerchantCategoryRel rel = new com.example.paotui.entity.MerchantCategoryRel();
            rel.setMerchantId(m.getId()); rel.setCategoryId(c.getId()); categoryRelMapper.insert(rel);
        }
    }

    // -------------------------------------------------- 请求体

    @Data
    public static class UserSaveReq {
        public String name;
        public String phone;
        public String password;
        public String status;
        public List<String> roles;
        public String customerNote;
        public String customerAddress;
        public MerchantReq merchant;
    }

    @Data
    public static class MerchantReq {
        public String name;
        public List<String> categories;
        public String phone;
        public String address;
        public String extra;
    }

    @Data
    public static class ResetPwdReq {
        public String password;
    }
}
