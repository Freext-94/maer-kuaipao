package com.example.paotui.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "paotui")
public class AppProperties {

    /** 小票、送达照的落盘目录 */
    private String uploadDir = "./data/uploads";

    private Bootstrap bootstrap = new Bootstrap();

    @Data
    public static class Bootstrap {
        private String staffPhone = "";
        private String staffName = "老板";
        private String staffPassword = "";
    }
}
