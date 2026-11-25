package com.example.paotui.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.paotui.entity.LedgerEntry;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface LedgerEntryMapper extends BaseMapper<LedgerEntry> {

    /** 余额就是流水之和，没有第二个来源。 */
    @Select("SELECT COALESCE(SUM(amount_fen), 0) FROM t_ledger_entry WHERE customer_id = #{customerId}")
    Long sumBalance(@Param("customerId") long customerId);

    @Select("SELECT * FROM t_ledger_entry WHERE customer_id = #{customerId} ORDER BY occurred_at ASC, id ASC")
    List<LedgerEntry> listOrderedByTime(@Param("customerId") long customerId);

    @Select("SELECT COUNT(*) FROM t_ledger_entry")
    long countAll();

    @Select("SELECT DISTINCT customer_id FROM t_ledger_entry")
    List<Long> selectDistinctCustomerIds();
}
