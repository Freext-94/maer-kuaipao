package com.example.paotui.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.paotui.entity.LedgerAllocation;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface LedgerAllocationMapper extends BaseMapper<LedgerAllocation> {

    /** 核销关系是派生数据：重算前先清掉该客户全部付款流水产生的分配。 */
    @Delete("""
            DELETE FROM t_ledger_allocation
            WHERE payment_entry_id IN (SELECT id FROM t_ledger_entry WHERE customer_id = #{customerId})
            """)
    int deleteForCustomer(@Param("customerId") long customerId);

    @Select("SELECT COALESCE(SUM(allocated_fen), 0) FROM t_ledger_allocation WHERE order_id = #{orderId}")
    Long sumAllocatedOnOrder(@Param("orderId") long orderId);

    @Select("SELECT COALESCE(SUM(allocated_fen), 0) FROM t_ledger_allocation WHERE charged_entry_id = #{chargedId}")
    Long sumAllocatedByCharged(@Param("chargedId") long chargedId);

    @Select("""
            SELECT COALESCE(SUM(a.allocated_fen), 0)
            FROM t_ledger_allocation a
            JOIN t_ledger_entry e ON e.id = a.payment_entry_id
            WHERE e.customer_id = #{customerId} AND a.prepaid = 1
            """)
    Long sumPrepaidByCustomer(@Param("customerId") long customerId);

    @Select("""
            SELECT COALESCE(SUM(a.allocated_fen), 0)
            FROM t_ledger_allocation a
            JOIN t_ledger_entry e ON e.id = a.payment_entry_id
            WHERE e.customer_id = #{customerId} AND a.charged_entry_id IS NOT NULL
            """)
    Long sumAllocatedOfCustomer(@Param("customerId") long customerId);

    /** 一次取回该客户每条挂账已被核销多少，避免逐条查询。 */
    @Select("""
            SELECT a.charged_entry_id AS entryId, SUM(a.allocated_fen) AS usedFen
            FROM t_ledger_allocation a
            JOIN t_ledger_entry e ON e.id = a.payment_entry_id
            WHERE e.customer_id = #{customerId} AND a.charged_entry_id IS NOT NULL
            GROUP BY a.charged_entry_id
            """)
    java.util.List<java.util.Map<String, Object>> sumAllocatedGroupedByCharged(@Param("customerId") long customerId);
}
