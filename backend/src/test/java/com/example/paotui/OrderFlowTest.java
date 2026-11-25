package com.example.paotui;

import com.example.paotui.common.BizException;
import com.example.paotui.entity.Order;
import com.example.paotui.enums.LedgerType;
import com.example.paotui.enums.OrderStatus;
import com.example.paotui.service.LedgerService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 新流程全链路：录单 → 待派单 → 派单 → 取货中 → 取货 → 配送中 → 配送完成（收款）→ 完成/挂账。
 * 去掉了备货环节，配送完成合并了送达和结单收款。
 */
class OrderFlowTest extends DbTest {

    @Test
    @DisplayName("演示剧本：电话录单到部分收款，账必须一笔不差")
    void happyPathWithPartialPayment() {
        var c = cmd(8600, 800);
        c.setRiderId(riderId);
        Order o = orders.create(c);

        assertEquals(OrderStatus.PICKING.name(), o.getStatus(), "录单时定了骑手，就该直接进取货中");
        var v = orders.require(o.getId());
        assertEquals("phone", v.getSource());
        assertNotNull(v.getCreatedByUserId());

        long receipt = fakeAttachment("receipt", v.getId());
        orders.markPicked(v.getId(), 9240L, receipt, "cash");
        v = orders.require(v.getId());
        assertEquals(OrderStatus.DELIVERING.name(), v.getStatus(), "取货后直接进配送中");
        assertEquals(9240L, v.getGoodsRealFen(), "实付货款按分存");
        assertEquals(10040L, orders.receivable(v), "92.40 + 8.00");

        // 配送完成：收 50，挂 50.40
        orders.completeDelivery(v.getId(), null, 5000L, "wechat");

        v = orders.require(v.getId());
        assertEquals(OrderStatus.FINISHED.name(), v.getStatus());
        assertEquals(5000L, ledger.paidOnOrder(v.getId()), "本单已核销正好 50.00");
        assertEquals(5040L, ledger.balance(customerId), "王姐欠款增加 50.40");
        assertEquals(5040L, openOn(v.getId()), "本单还欠 50.40");
        assertHealthy();
    }

    @Test
    @DisplayName("货款争议只能加冲正流水，原值和小票都不许动")
    void disputeGoesThroughReversingEntry() {
        Order o = deliveringOrder();
        long before = ledger.balance(customerId);
        orders.adjustAmount(o.getId(), -440L, "客户与商家核对小票，西瓜称重偏高", LedgerType.ADJUST);

        Order after = orders.require(o.getId());
        assertEquals(9240L, after.getGoodsRealFen(), "小票上的 92.40 必须原样留着");
        assertEquals(9600L, orders.receivable(after), "应收自动重算成 96.00");
        assertEquals(before - 440L, ledger.balance(customerId), "欠款同步降 4.40");
        assertHealthy();

        assertThrows(BizException.class, () -> orders.adjustAmount(o.getId(), -100L, "  ", LedgerType.ADJUST),
                "不写原因的调整必须被拒");
    }

    @Test
    @DisplayName("非法流转全部拒绝")
    void illegalTransitionsRejected() {
        Order o = orders.create(cmd(5000, 800));
        assertThrows(BizException.class, () -> orders.markPicked(o.getId(), 5000L, 1L, "cash"),
                "待派单不能直接取货");
        assertThrows(BizException.class, () -> orders.completeDelivery(o.getId(), null, 100L, "cash"),
                "待派单不能直接配送完成");

        orders.dispatch(o.getId(), riderId);
        assertEquals(OrderStatus.PICKING.name(), orders.require(o.getId()).getStatus());
        assertThrows(BizException.class, () -> orders.completeDelivery(o.getId(), null, 100L, "cash"),
                "取货中不能直接配送完成");
    }

    @Test
    @DisplayName("取货可以 0 元、可以不传小票")
    void pickupAllowsZeroAndNoReceipt() {
        Order o = orders.create(cmd(6000, 800));
        orders.dispatch(o.getId(), riderId);

        // 0 元取货、不传小票
        orders.markPicked(o.getId(), 0L, null, "cash");
        Order after = orders.require(o.getId());
        assertEquals(0L, after.getGoodsRealFen());
        assertNull(orders.advanceOf(o.getId()), "0 元不建垫付台账");
    }

    @Test
    @DisplayName("垫付没交代的单，进不了终态")
    void cancelBlockedUntilAdvanceSettled() {
        Order o = deliveringOrder();
        assertThrows(BizException.class, () -> orders.cancel(o.getId(), "客户取消", "", 0L, false),
                "一分钱没追回又不认损 → 拒绝");
        assertThrows(BizException.class, () -> orders.cancel(o.getId(), "客户取消", "", 2000L, false),
                "只追回 20/92.40 → 仍然拒绝");

        orders.cancel(o.getId(), "客户取消", "商家同意退部分", 9240L, false);
        Order after = orders.require(o.getId());
        assertEquals(OrderStatus.CANCELLED.name(), after.getStatus());
        assertEquals("settled", orders.advanceOf(o.getId()).getStatus());
        assertHealthy();
    }

    @Test
    @DisplayName("认损的垫付进平台成本，不算到客户头上")
    void cancelWithLoss() {
        Order o = deliveringOrder();
        long owedBefore = ledger.balance(customerId);
        orders.cancel(o.getId(), "客户取消", "西瓜已切开退不了", 2000L, true);

        var adv = orders.advanceOf(o.getId());
        assertEquals(7240L, adv.getLossFen(), "追回 20，损失 72.40");
        assertEquals("loss", adv.getStatus());
        assertEquals(owedBefore, ledger.balance(customerId), "这张单从没挂过账，客户欠款不该变");
        assertHealthy();
    }

    @Test
    @DisplayName("多付的钱转预收，不产生负挂账")
    void overpaymentBecomesPrepaid() {
        ledger.post(customerId, null, LedgerType.PAYMENT, -10000L, "wechat", "客户多打了个整", "老板", "pre:1", null);
        assertEquals(-10000L, ledger.balance(customerId));
        assertEquals(10000L, ledger.prepaidOf(customerId));
        assertHealthy();
    }

    @Test
    @DisplayName("收款默认先冲最老挂账，指明单据时先冲本单")
    void fifoAllocationOrder() {
        Order old = deliveringOrder();
        orders.completeDelivery(old.getId(), null, 0L, "credit");
        assertEquals(10040L, openOn(old.getId()));

        Order fresh = deliveringOrderAt(20000L);
        orders.completeDelivery(fresh.getId(), null, 5000L, "wechat");
        assertEquals(15800L, openOn(fresh.getId()), "本单付款优先冲本单");

        ledger.post(customerId, null, LedgerType.PAYMENT, -3000L, "wechat", "零散收款", "老板", "pay:loose", null);
        assertEquals(7040L, openOn(old.getId()), "旧单被冲掉 30.00");
        assertEquals(15800L, openOn(fresh.getId()), "新单剩余不受影响");

        ledger.post(customerId, fresh.getId(), LedgerType.PAYMENT, -800L, "cash", "客户指明是这单的尾款", "老板", "pay:tag", null);
        assertEquals(15000L, openOn(fresh.getId()));
        assertEquals(7040L, openOn(old.getId()));
        assertHealthy();
    }

    @Test
    @DisplayName("同一幂等键重复提交只落一条流水")
    void idempotentPayment() {
        Order o = deliveringOrder();
        orders.completeDelivery(o.getId(), null, 0L, "credit");
        long before = ledger.balance(customerId);
        ledger.post(customerId, null, LedgerType.PAYMENT, -1000L, "cash", "重复测试", "老板", "same-key", null);
        ledger.post(customerId, null, LedgerType.PAYMENT, -1000L, "cash", "重复测试", "老板", "same-key", null);
        assertEquals(before - 1000L, ledger.balance(customerId), "两次提交只该扣一次");
        assertEquals(1, entryCountWithKey("same-key"));
        assertHealthy();
    }

    @Test
    @DisplayName("配送完成选「欠款」实收必须为 0")
    void creditMethodRequiresZeroPayment() {
        Order o = deliveringOrder();
        assertThrows(BizException.class, () -> orders.completeDelivery(o.getId(), null, 5000L, "credit"),
                "选欠款不能填实收");
        orders.completeDelivery(o.getId(), null, 0L, "credit");
        assertEquals(OrderStatus.FINISHED.name(), orders.require(o.getId()).getStatus());
        assertHealthy();
    }

    @Test
    @DisplayName("数据库层拦住对流水的 UPDATE/DELETE，绕过应用也不行")
    void ledgerIsAppendOnlyAtDbLevel() {
        Order o = deliveringOrder();
        orders.completeDelivery(o.getId(), null, 0L, "credit");
        Long id = jdbc.queryForObject(
                "SELECT id FROM t_ledger_entry WHERE order_id = ? AND type = 'charge'", Long.class, o.getId());
        assertNotNull(id);

        DataAccessException up = assertThrows(DataAccessException.class,
                () -> jdbc.update("UPDATE t_ledger_entry SET amount_fen = 1 WHERE id = ?", id));
        assertTrue(rootMsg(up).contains("append-only"), rootMsg(up));

        DataAccessException del = assertThrows(DataAccessException.class,
                () -> jdbc.update("DELETE FROM t_ledger_entry WHERE id = ?", id));
        assertTrue(rootMsg(del).contains("append-only"), rootMsg(del));
    }

    @Test
    @DisplayName("流水类型大小写写错必须报错，不能被静默当成挂账")
    void illegalLedgerTypeFailsLoud() {
        jdbc.update("INSERT INTO t_ledger_entry (customer_id, type, amount_fen, occurred_at, period_month, note, operator, idempotency_key) "
                        + "VALUES (?, 'payment', -100, NOW(), DATE_FORMAT(NOW(), '%Y-%m'), '手写错了大小写', 'demo', 'bad-case-1')",
                customerId);
        BizException e = assertThrows(BizException.class, () -> ledger.reallocate(customerId));
        assertTrue(e.getMessage().contains("不是合法值"), e.getMessage());
    }

    // ------------------------------------------------------------ helpers

    /** 造一张已配送中（取完货）的单：录单→派单→取货 */
    private Order deliveringOrder() {
        return deliveringOrderAt(9240L);
    }

    private Order deliveringOrderAt(long realFen) {
        Order o = orders.create(cmd(8600, 800));
        orders.dispatch(o.getId(), riderId);
        orders.markPicked(o.getId(), realFen, fakeAttachment("receipt", o.getId()), "cash");
        return orders.require(o.getId());
    }

    private long openOn(long orderId) {
        return ledger.openCharges(customerId).stream()
                .filter(oc -> oc.entry().getOrderId() != null && oc.entry().getOrderId() == orderId)
                .mapToLong(LedgerService.OpenCharge::openFen).findFirst().orElse(0L);
    }

    private long entryCountWithKey(String key) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM t_ledger_entry WHERE idempotency_key = ?", Long.class, key);
    }

    private static String rootMsg(Throwable t) {
        Throwable c = t;
        while (c.getCause() != null) {
            c = c.getCause();
        }
        return String.valueOf(c.getMessage());
    }
}
