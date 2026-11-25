package com.example.paotui.config;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.entity.User;
import com.example.paotui.mapper.UserMapper;
import com.example.paotui.service.AccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

/**
 * 空库第一次起来时给老板建一个能进调度台的账号，
 * 否则装完系统没人进得去。密码只在配置里给初值，登录后应改。
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class BootstrapConfig {

    private final AppProperties props;
    private final UserMapper userMapper;
    private final AccountService accounts;
    private final PasswordEncoder encoder;

    @Bean
    public ApplicationRunner bootstrapStaff() {
        return args -> {
            String phone = props.getBootstrap().getStaffPhone();
            String pwd = props.getBootstrap().getStaffPassword();
            if (phone == null || phone.isBlank() || pwd == null || pwd.isBlank()) {
                log.warn("未配置 paotui.bootstrap，跳过初始账号（将没有可用登录）");
                return;
            }
            User exist = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getPhone, phone));
            if (exist == null) {
                accounts.createUser(phone, props.getBootstrap().getStaffName(), encoder.encode(pwd), List.of("super_admin", "admin"));
                log.info("已创建调度台初始账号 {}", phone);
                return;
            }
            // 导过 demo-data.sql 的话账号已存在但没密码，这里补上，否则第一次登录进不去
            if (exist.getPasswordHash() == null || exist.getPasswordHash().isBlank()) {
                exist.setPasswordHash(encoder.encode(pwd));
                userMapper.updateById(exist);
                log.info("已为已存在的账号 {} 设置初始密码", phone);
            }
        };
    }
}
