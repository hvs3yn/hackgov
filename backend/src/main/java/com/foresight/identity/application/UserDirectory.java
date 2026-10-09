package com.foresight.identity.application;

import com.foresight.common.error.ApiException;
import com.foresight.identity.domain.User;
import com.foresight.identity.domain.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Read API of the identity module for other modules.
 */
@Service
@Transactional(readOnly = true)
public class UserDirectory {

    private final UserRepository users;

    public UserDirectory(UserRepository users) {
        this.users = users;
    }

    public Optional<UserSummary> findByEmail(String email) {
        return users.findByEmail(User.normalizeEmail(email)).map(UserDirectory::toSummary);
    }

    public UserSummary require(UUID id) {
        return users.findById(id).map(UserDirectory::toSummary).orElseThrow(() -> ApiException.notFound("User"));
    }

    public Map<UUID, UserSummary> findAll(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return users.findAllById(ids.stream().distinct().toList()).stream()
                .map(UserDirectory::toSummary)
                .collect(Collectors.toMap(UserSummary::id, Function.identity()));
    }

    static UserSummary toSummary(User user) {
        return new UserSummary(user.getId(), user.getFullName(), user.getEmail());
    }
}
