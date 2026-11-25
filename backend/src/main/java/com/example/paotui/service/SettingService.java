package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.entity.Setting;
import com.example.paotui.mapper.SettingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 零散配置读写。值都是字符串，业务层自己转。 */
@Service
@RequiredArgsConstructor
public class SettingService {

    private final SettingMapper mapper;

    public String get(String key, String def) {
        Setting s = mapper.selectOne(Wrappers.<Setting>lambdaQuery().eq(Setting::getK, key));
        return s == null || s.getV() == null || s.getV().isBlank() ? def : s.getV();
    }

    public long getLong(String key, long def) {
        try {
            return Long.parseLong(get(key, String.valueOf(def)));
        } catch (NumberFormatException e) {
            return def;
        }
    }

    public Map<String, String> all() {
        Map<String, String> m = new LinkedHashMap<>();
        for (Setting s : mapper.selectList(Wrappers.<Setting>lambdaQuery().orderByAsc(Setting::getK))) {
            m.put(s.getK(), s.getV());
        }
        return m;
    }

    @Transactional
    public void put(String key, String value, String remark) {
        Setting s = mapper.selectOne(Wrappers.<Setting>lambdaQuery().eq(Setting::getK, key));
        if (s == null) {
            s = new Setting();
            s.setK(key);
            s.setV(value == null ? "" : value);
            s.setRemark(remark == null ? "" : remark);
            mapper.insert(s);
        } else {
            s.setV(value == null ? "" : value);
            if (remark != null) {
                s.setRemark(remark);
            }
            mapper.updateById(s);
        }
    }

    @Transactional
    public void putAll(Map<String, String> patch) {
        if (patch == null) {
            return;
        }
        patch.forEach((k, v) -> put(k, v, null));
    }

    public List<Setting> list() {
        return mapper.selectList(Wrappers.<Setting>lambdaQuery().orderByAsc(Setting::getK));
    }
}
