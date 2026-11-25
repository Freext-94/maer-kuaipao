package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.example.paotui.common.Result;
import com.example.paotui.entity.Attachment;
import com.example.paotui.entity.Customer;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.User;
import com.example.paotui.service.AccountService;
import com.example.paotui.service.CatalogService;
import com.example.paotui.service.LedgerService;
import com.example.paotui.service.UploadService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 主数据与凭证照片。 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminCatalogController {

    private final CatalogService catalog;
    private final AccountService accounts;
    private final LedgerService ledger;
    private final UploadService uploads;

    // -------------------------------------------------- 客户
    @GetMapping("/customers")
    @RequirePerm("NONE")
    public Result<List<Map<String, Object>>> customers(@RequestParam(required = false) String q) {
        List<Customer> rows = (q == null || q.isBlank())
                ? catalog.listCustomers()
                : catalog.searchCustomers(q, 30);
        return Result.ok(rows.stream().map(c -> {
            // 用户可能被软删；档案仍要能读，展示时容忍缺失账号
            User u = accounts.nullableById(c.getUserId());
            if (u == null) {
                u = new User();
                u.setPhone("");
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("name", u.getName());
            m.put("phone", u.getPhone());
            m.put("note", c.getNote());
            m.put("owedFen", ledger.balance(c.getId()));
            m.put("addresses", catalog.addresses(c.getId()));
            return m;
        }).toList());
    }

    @PostMapping("/customers")
    @RequirePerm("customer.manage")
    public Result<Customer> createCustomer(@RequestBody CustomerReq req) {
        return Result.ok(catalog.createCustomer(req.name, req.phone, req.note));
    }

    @PostMapping("/customers/{id}/addresses")
    @RequirePerm("customer.manage")
    public Result<Object> addAddress(@PathVariable long id, @RequestBody AddressReq req) {
        return Result.ok(catalog.addAddress(id, req.address, Boolean.TRUE.equals(req.isDefault)));
    }

    // -------------------------------------------------- 商家
    @GetMapping("/merchants")
    @RequirePerm("NONE")
    public Result<List<Merchant>> merchants(@RequestParam(required = false) String q) {
        return Result.ok((q == null || q.isBlank()) ? catalog.listMerchants() : catalog.searchMerchants(q, 30));
    }

    @PostMapping("/merchants")
    @RequirePerm("merchant.manage")
    public Result<Merchant> saveMerchant(@RequestBody Merchant m) {
        return Result.ok(catalog.saveMerchant(m));
    }

    // -------------------------------------------------- 骑手
    @GetMapping("/riders")
    @RequirePerm("NONE")
    public Result<List<Map<String, Object>>> riders() {
        return Result.ok(accounts.listRiders().stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", u.getId());
            m.put("name", u.getName());
            m.put("phone", u.getPhone());
            return m;
        }).toList());
    }

    @PostMapping("/riders")
    @RequirePerm("rider.manage")
    public Result<User> createRider(@RequestBody RiderReq req) {
        User u = accounts.byPhone(req.phone);
        if (u == null) {
            u = accounts.createUser(req.phone, req.name, "", List.of("rider"));
        }
        return Result.ok(u);
    }

    // -------------------------------------------------- 凭证照片
    @PostMapping("/upload")
    @RequirePerm("@upload")
    public Result<Map<String, Object>> upload(@RequestPart("file") MultipartFile file,
                                             @RequestParam String bizType,
                                             @RequestParam long bizId) {
        Attachment a = uploads.save(file, bizType, bizId, com.example.paotui.security.Ctx.actorName());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("url", a.getStoragePath());
        return Result.ok(m);
    }

    @Data
    public static class CustomerReq {
        public String name;
        public String phone;
        public String note;
    }

    @Data
    public static class AddressReq {
        public String address;
        public Boolean isDefault;
    }

    @Data
    public static class RiderReq {
        public String name;
        public String phone;
    }

}
