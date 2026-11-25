package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.entity.Goods;
import com.example.paotui.mapper.GoodsMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 后台维护的默认商品库，不与商家关联，客户下单可直接点选。 */
@RestController
@RequestMapping("/api/admin/default-goods")
@RequiredArgsConstructor
public class DefaultGoodsController {

    private final GoodsMapper mapper;

    @GetMapping
    @RequirePerm("NONE")
    public Result<List<Goods>> list() {
        return Result.ok(mapper.selectList(Wrappers.<Goods>lambdaQuery()
                .orderByAsc(Goods::getSortNo).orderByAsc(Goods::getId)));
    }

    @PostMapping
    @RequirePerm("setting.manage")
    public Result<Goods> create(@RequestBody GoodsReq req) {
        Goods g = new Goods();
        fill(g, req);
        g.setOnSale(req.onSale == null || req.onSale ? 1 : 0);
        g.setSortNo(req.sortNo == null ? 99 : req.sortNo);
        mapper.insert(g);
        return Result.ok(g);
    }

    @PutMapping("/{id}")
    @RequirePerm("setting.manage")
    public Result<Goods> update(@PathVariable long id, @RequestBody GoodsReq req) {
        Goods g = mapper.selectById(id);
        if (g == null) {
            throw new BizException("默认商品不存在");
        }
        fill(g, req);
        if (req.onSale != null) {
            g.setOnSale(req.onSale ? 1 : 0);
        }
        if (req.sortNo != null) {
            g.setSortNo(req.sortNo);
        }
        mapper.updateById(g);
        return Result.ok(g);
    }

    @DeleteMapping("/{id}")
    @RequirePerm("setting.manage")
    public Result<Void> delete(@PathVariable long id) {
        Goods g = mapper.selectById(id);
        if (g == null) {
            throw new BizException("默认商品不存在");
        }
        mapper.deleteById(id);
        return Result.ok(null);
    }

    private void fill(Goods g, GoodsReq req) {
        if (req.name == null || req.name.isBlank()) {
            throw new BizException("品名不能为空");
        }
        if (req.estPriceFen != null && req.estPriceFen < 0) {
            throw new BizException("估价不能是负数");
        }
        g.setName(req.name.trim());
        g.setSpec(req.spec == null ? "" : req.spec.trim());
        g.setEstPriceFen(req.estPriceFen == null ? 0L : req.estPriceFen);
    }

    @Data
    public static class GoodsReq {
        public String name;
        public String spec;
        public Long estPriceFen;
        public Boolean onSale;
        public Integer sortNo;
    }
}
