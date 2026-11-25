package com.example.paotui;

import com.example.paotui.mapper.AttachmentMapper;
import com.example.paotui.entity.Attachment;
import com.example.paotui.entity.Merchant;
import com.example.paotui.entity.User;
import com.example.paotui.security.Ctx;
import com.example.paotui.security.Principal;
import com.example.paotui.service.AccountService;
import com.example.paotui.service.CatalogService;
import com.example.paotui.service.LedgerService;
import com.example.paotui.service.OrderService;
import com.example.paotui.service.HealthService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 集成测试跑在真 MySQL 上：建表语句、触发器、FIFO 核销都得是真的才算验过。
 * 每个用例前 clean+migrate，因为 t_ledger_entry 上有禁止 DELETE 的触发器，
 * 普通清库语句会被自己的防线拦住，只有 Flyway clean 能连带把触发器一起拆掉。
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class DbTest {

    @Autowired
    protected Flyway flyway;
    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected OrderService orders;
    @Autowired
    protected LedgerService ledger;
    @Autowired
    protected CatalogService catalog;
    @Autowired
    protected AccountService accounts;
    @Autowired
    protected HealthService health;
    @Autowired
    protected AttachmentMapper attachmentMapper;

    protected Long merchantId;
    protected Long merchantId2;
    protected Long riderId;
    protected Long riderId2;
    protected Long customerId;

    @BeforeEach
    void resetDb() {
        flyway.clean();
        flyway.migrate();
        loginStaff();

        merchantId = newMerchant("瑞雪生鲜超市", "13908001111");
        merchantId2 = newMerchant("康泰大药房", "13908002222");
        riderId = newRider("小李", "13700001111");
        riderId2 = newRider("老板本人", "13700002222");
        customerId = catalog.createCustomer("王姐", "13512340001", "老客户").getId();
        catalog.addAddress(customerId, "天府新城 B 区 3 栋 3-2-1802", true);
    }

    @AfterEach
    void clearCtx() {
        Ctx.clear();
    }

    protected void loginStaff() {
        User boss = accounts.createUser("13800000000", "老板", "", List.of("admin"));
        Principal p = new Principal();
        p.setUserId(boss.getId());
        p.setName(boss.getName());
        p.getRoles().add("admin");
        Ctx.set(p);
    }

    protected Long newMerchant(String name, String phone) {
        Merchant m = new Merchant();
        m.setName(name);
        m.setPhone(phone);
        m.setCategory("超市");
        m.setPrepTimeoutMin(10);
        m.setStatus("active");
        m.setSource("user");
        return catalog.saveMerchant(m).getId();
    }

    protected Long newRider(String name, String phone) {
        return accounts.createUser(phone, name, "", List.of("rider")).getId();
    }

    /** 上传需要 MultipartFile，测试里只关心"有没有凭证 ID"，直接落一条记录。 */
    protected long fakeAttachment(String bizType, long bizId) {
        Attachment a = new Attachment();
        a.setBizType(bizType);
        a.setBizId(bizId);
        a.setFileName("test-" + bizId + ".jpg");
        a.setStoragePath("/files/test-" + bizId + ".jpg");
        a.setContentType("image/jpeg");
        a.setSizeBytes(1024L);
        a.setSha1("0".repeat(40));
        a.setUploader("test");
        a.setCreator("test");
        attachmentMapper.insert(a);
        return a.getId();
    }

    protected com.example.paotui.dto.OrderCreateCmd cmd(long estFen, long feeFen) {
        var c = new com.example.paotui.dto.OrderCreateCmd();
        c.setSource("phone");
        c.setCustomerId(customerId);
        c.setMerchantId(merchantId);
        c.setGoodsText("3 个西瓜 + 一提抽纸");
        c.setGoodsEstFen(estFen);
        c.setServiceFeeFen(feeFen);
        return c;
    }

    protected void assertHealthy() {
        List<String> issues = health.issues();
        assertTrue(issues.isEmpty(), "台账恒等式被破坏：" + issues);
    }

    protected static LocalDateTime now() {
        return LocalDateTime.now();
    }
}
