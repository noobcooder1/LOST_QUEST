package com.lostquest.dto;

import java.util.List;
import org.springframework.data.domain.Slice;
import java.util.function.Function;

public record CommunityPage<T>(List<T> items, int page, boolean hasNext) {
    public static <E, T> CommunityPage<T> from(Slice<E> slice, Function<E, T> map) {
        return new CommunityPage<>(slice.getContent().stream().map(map).toList(), slice.getNumber(), slice.hasNext());
    }
}
