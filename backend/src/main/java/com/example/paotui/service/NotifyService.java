package com.example.paotui.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.entity.NotifyRecord;
import com.example.paotui.enums.NotifyChannel;
import com.example.paotui.enums.NotifyStatus;
import com.example.paotui.mapper.NotifyRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Track A 没有订阅消息也没有短信签名，所以"通知"实际是两件不同的事：
 * 1) 商家页面自己来拉（poll）——这是主路径，无配额；
 * 2) 拉不到时提醒老板打电话（manual）——兜底。
 * 每次触达都落库，为的是能回答"我那天没收到"。
 */
@Service
@RequiredArgsConstructor
public class NotifyService {

    private final NotifyRecordMapper notifyMapper;

    public void record(Long orderId, String scene, NotifyChannel channel, String target, NotifyStatus status) {
        NotifyRecord n = new NotifyRecord();
        n.setOrderId(orderId);
        n.setScene(scene);
        n.setChannel(channel.name());
        n.setTarget(target == null ? "" : target);
        n.setStatus(status.name());
        n.setAttempts(1);
        n.setSentAt(LocalDateTime.now());
        notifyMapper.insert(n);
    }

    /** 商家拉单：把该商家所有"待发送"的常驻页通知标成已读。 */
    public int ackPolled(Long orderId) {
        NotifyRecord n = notifyMapper.selectOne(Wrappers.<NotifyRecord>lambdaQuery()
                .eq(NotifyRecord::getOrderId, orderId)
                .eq(NotifyRecord::getChannel, NotifyChannel.POLL.name())
                .eq(NotifyRecord::getStatus, NotifyStatus.QUEUED.name()));
        if (n == null) {
            return 0;
        }
        n.setStatus(NotifyStatus.ACKED.name());
        n.setAckedAt(LocalDateTime.now());
        notifyMapper.updateById(n);
        return 1;
    }

    public boolean wasPolled(Long orderId) {
        return notifyMapper.selectCount(Wrappers.<NotifyRecord>lambdaQuery()
                .eq(NotifyRecord::getOrderId, orderId)
                .eq(NotifyRecord::getChannel, NotifyChannel.POLL.name())
                .in(NotifyRecord::getStatus, NotifyStatus.ACKED.name())) > 0;
    }

    public List<NotifyRecord> ofOrder(Long orderId) {
        return notifyMapper.selectList(Wrappers.<NotifyRecord>lambdaQuery()
                .eq(NotifyRecord::getOrderId, orderId).orderByDesc(NotifyRecord::getId));
    }

    /** 这个渠道历史上到底管不管用，月底能一条 SQL 看出来。 */
    public List<String> channelStats() {
        return notifyMapper.statusByChannel().stream()
                .map(m -> m.get("channel") + ":" + m.get("status") + "×" + m.get("n")).toList();
    }
}
