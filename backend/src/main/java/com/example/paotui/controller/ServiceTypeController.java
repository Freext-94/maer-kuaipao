package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.entity.ServiceType;
import com.example.paotui.mapper.ServiceTypeMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Set;

/** 服务类型管理：代买/代取送/代办/接送/代驾，后台可新增、传图标、配表单。 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class ServiceTypeController {

    private static final Set<String> BUILTIN = Set.of("buy", "pickup", "errand", "transfer", "driver");

    private final ServiceTypeMapper mapper;

    @GetMapping("/service-types")
    @RequirePerm("NONE")
    public Result<List<ServiceType>> list(@RequestParam(required = false, defaultValue = "false") boolean enabledOnly) {
        return Result.ok(mapper.selectList(Wrappers.<ServiceType>lambdaQuery()
                .eq(enabledOnly, ServiceType::getEnabled, 1)
                .orderByAsc(ServiceType::getSortNo)));
    }

    @PostMapping("/service-types")
    @RequirePerm("service.manage")
    public Result<ServiceType> create(@RequestBody ServiceTypeReq req) {
        if (req.code == null || !req.code.matches("[a-z][a-z0-9_]{1,31}")) {
            throw new BizException("类型码要小写字母开头，2~32 位");
        }
        if (req.name == null || req.name.isBlank()) {
            throw new BizException("要填显示名");
        }
        if (mapper.selectCount(Wrappers.<ServiceType>lambdaQuery().eq(ServiceType::getCode, req.code)) > 0) {
            throw new BizException("类型码「" + req.code + "」已存在");
        }
        ServiceType t = new ServiceType();
        t.setCode(req.code.trim());
        t.setName(req.name.trim());
        t.setFlowKind(req.flowKind == null ? "service" : req.flowKind);
        t.setBaseFeeFen(req.baseFeeFen == null ? 1000L : req.baseFeeFen);
        t.setIconPath(req.iconPath == null ? "" : req.iconPath);
        t.setFormSchema(req.formSchema);
        t.setSortNo(req.sortNo == null ? 99 : req.sortNo);
        t.setEnabled(1);
        mapper.insert(t);
        return Result.ok(t);
    }

    @PutMapping("/service-types/{id}")
    @RequirePerm("service.manage")
    public Result<ServiceType> update(@PathVariable long id, @RequestBody ServiceTypeReq req) {
        ServiceType t = mapper.selectById(id);
        if (t == null) {
            throw new BizException("服务类型不存在");
        }
        if (req.name != null && !req.name.isBlank()) {
            t.setName(req.name.trim());
        }
        if (req.iconPath != null) {
            t.setIconPath(req.iconPath);
        }
        if (req.formSchema != null) {
            t.setFormSchema(req.formSchema);
        }
        if (req.sortNo != null) {
            t.setSortNo(req.sortNo);
        }
        if (req.baseFeeFen != null) {
            if (req.baseFeeFen < 0) {
                throw new BizException("基础费不能是负数");
            }
            t.setBaseFeeFen(req.baseFeeFen);
        }
        if (req.enabled != null) {
            t.setEnabled(req.enabled ? 1 : 0);
        }
        // 内置类型的 code/flowKind 不可改
        if (!BUILTIN.contains(t.getCode()) && req.flowKind != null) {
            t.setFlowKind(req.flowKind);
        }
        mapper.updateById(t);
        return Result.ok(t);
    }

    /** 图标上传：接受 SVG/WebP/PNG/JPG，返回存储路径。 */
    @PostMapping("/service-types/{id}/icon")
    @RequirePerm("service.manage")
    public Result<ServiceType> uploadIcon(@PathVariable long id, @RequestParam("file") MultipartFile file) {
        ServiceType t = mapper.selectById(id);
        if (t == null) {
            throw new BizException("服务类型不存在");
        }
        if (file == null || file.isEmpty()) {
            throw new BizException("请上传图标");
        }
        String ct = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        String ext;
        if (ct.contains("svg")) {
            ext = ".svg";
        } else if (ct.contains("webp")) {
            ext = ".webp";
        } else if (ct.contains("png")) {
            ext = ".png";
        } else if (ct.contains("jpeg") || ct.contains("jpg")) {
            ext = ".jpg";
        } else {
            throw new BizException("只接受 SVG/WebP/PNG/JPG 图标");
        }
        String name = "svc-" + t.getCode() + ext;
        try {
            java.nio.file.Path dir = java.nio.file.Path.of("./data/uploads").toAbsolutePath().normalize();
            java.nio.file.Files.createDirectories(dir);
            if (".svg".equals(ext)) {
                // SVG 清洗：移除脚本、事件属性、foreignObject、外链引用
                String raw = new String(file.getBytes(), java.nio.charset.StandardCharsets.UTF_8);
                String cleaned = sanitizeSvg(raw);
                java.nio.file.Files.writeString(dir.resolve(name), cleaned, java.nio.charset.StandardCharsets.UTF_8);
            } else {
                file.transferTo(dir.resolve(name));
            }
        } catch (Exception e) {
            throw new BizException("图标保存失败：" + e.getMessage());
        }
        t.setIconPath("/files/" + name);
        mapper.updateById(t);
        return Result.ok(t);
    }

    /** SVG 清洗：移除 script/foreignObject/on* 事件属性/外链 href。 */
    private static String sanitizeSvg(String raw) {
        if (raw == null) return "";
        String s = raw;
        // 移除 script 标签及内容
        s = s.replaceAll("(?is)<script[^>]*>.*?</script>", "");
        // 移除 foreignObject 标签及内容
        s = s.replaceAll("(?is)<foreignObject[^>]*>.*?</foreignObject>", "");
        // 移除 on* 事件属性
        s = s.replaceAll("(?i)\\s+on\\w+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", "");
        // 移除 javascript: / data: 外链 href
        s = s.replaceAll("(?i)href\\s*=\\s*(\"javascript:[^\"]*\"|'javascript:[^']*')", "href=\"\"");
        s = s.replaceAll("(?i)href\\s*=\\s*(\"data:[^\"]*\"|'data:[^']*')", "href=\"\"");
        return s;
    }

    @Data
    public static class ServiceTypeReq {
        public String code;
        public String name;
        public String flowKind;
        public String iconPath;
        public String formSchema;
        public Integer sortNo;
        public Long baseFeeFen;
        public Boolean enabled;
    }
}
