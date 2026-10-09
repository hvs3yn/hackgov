package com.foresight.common.api;

import com.foresight.common.error.ApiException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds bounded {@link Pageable}s from query parameters with a per-endpoint sort whitelist
 * mapping API field names to entity properties.
 */
public final class PageRequests {

    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 20;

    private PageRequests() {
    }

    public static Pageable of(Integer page, Integer size, List<String> sort,
                              Map<String, String> allowedSorts, Sort defaultSort) {
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_SIZE : size;
        if (p < 0) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "page must be >= 0");
        }
        if (s < 1 || s > MAX_SIZE) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "size must be between 1 and " + MAX_SIZE);
        }
        Sort resolved = parseSort(sort, allowedSorts);
        if (resolved.isUnsorted()) {
            resolved = defaultSort;
        }
        return PageRequest.of(p, s, resolved);
    }

    private static Sort parseSort(List<String> sortParams, Map<String, String> allowed) {
        if (sortParams == null || sortParams.isEmpty()) {
            return Sort.unsorted();
        }
        // Spring splits "field,desc" into ["field", "desc"] when a single param is given; normalize both forms.
        List<String> tokens = new ArrayList<>();
        for (String raw : sortParams) {
            tokens.add(raw.trim());
        }
        List<Sort.Order> orders = new ArrayList<>();
        int i = 0;
        while (i < tokens.size()) {
            String token = tokens.get(i);
            String field;
            Sort.Direction direction = Sort.Direction.ASC;
            if (token.contains(",")) {
                String[] parts = token.split(",", 2);
                field = parts[0].trim();
                direction = direction(parts[1].trim());
                i++;
            } else {
                field = token;
                if (i + 1 < tokens.size() && isDirection(tokens.get(i + 1))) {
                    direction = direction(tokens.get(i + 1));
                    i += 2;
                } else {
                    i++;
                }
            }
            String property = allowed.get(field);
            if (property == null) {
                throw ApiException.badRequest("INVALID_ARGUMENT",
                        "Unsupported sort field '" + field + "'. Allowed: " + allowed.keySet());
            }
            orders.add(new Sort.Order(direction, property));
        }
        return Sort.by(orders);
    }

    private static boolean isDirection(String value) {
        return "asc".equalsIgnoreCase(value) || "desc".equalsIgnoreCase(value);
    }

    private static Sort.Direction direction(String value) {
        if (!isDirection(value)) {
            throw ApiException.badRequest("INVALID_ARGUMENT", "Sort direction must be asc or desc");
        }
        return Sort.Direction.fromString(value);
    }
}
