package com.example.paotui.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.paotui.entity.NotifyRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.Map;

@Mapper
public interface NotifyRecordMapper extends BaseMapper<NotifyRecord> {

    @Select("""
            SELECT channel, status, COUNT(*) AS n
            FROM t_notify_record
            GROUP BY channel, status
            ORDER BY channel
            """)
    java.util.List<Map<String, Object>> statusByChannel();
}
