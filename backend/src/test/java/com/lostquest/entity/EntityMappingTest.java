package com.lostquest.entity;

import com.lostquest.repository.FoundItemRepository;
import com.lostquest.repository.LostItemRepository;
import com.lostquest.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class EntityMappingTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private LostItemRepository lostItemRepository;

    @Autowired
    private FoundItemRepository foundItemRepository;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    @DisplayName("User, LostItem, FoundItem 엔티티 매핑 및 연관관계 저장/조회 검증")
    void testEntityMappingAndPersistence() {
        // 1. User 저장 및 매핑 검증
        String hash = passwordEncoder.encode("TestPassword123!");
        User user = new User("test@lostquest.com", hash, "탐험가", UserRole.USER);
        User savedUser = entityManager.persistAndFlush(user);

        assertThat(savedUser.getId()).isNotNull();
        assertThat(savedUser.getCreatedAt()).isNotNull();
        assertThat(savedUser.getNickname()).isEqualTo("탐험가");
        assertThat(savedUser.getRole()).isEqualTo(UserRole.USER);

        // 2. LostItem 저장 및 매핑 검증
        LostItem lostItem = new LostItem(
                savedUser,
                "갈색 가죽 지갑",
                "지갑",
                "갈색",
                "신분증과 카드가 들어있는 지갑입니다.",
                LocalDate.now(),
                "서울",
                "강남역 2번 출구",
                "/images/wallet.svg",
                LostItemStatus.LOST
        );
        LostItem savedLostItem = entityManager.persistAndFlush(lostItem);

        assertThat(savedLostItem.getId()).isNotNull();
        assertThat(savedLostItem.getCreatedAt()).isNotNull();
        assertThat(savedLostItem.getUser().getId()).isEqualTo(savedUser.getId());
        assertThat(savedLostItem.getStatus()).isEqualTo(LostItemStatus.LOST);
        assertThat(savedLostItem.getRegion()).isEqualTo("서울");

        // 3. FoundItem 저장 및 매핑 검증
        FoundItem foundItem = new FoundItem(
                savedUser,
                "에어팟 프로 케이스",
                "전자기기",
                "흰색",
                "충전 케이스만 습득했습니다.",
                LocalDate.now(),
                "서울",
                "홍대입구역 9번 출구",
                "/images/earbuds.svg",
                FoundItemStatus.STORED
        );
        FoundItem savedFoundItem = entityManager.persistAndFlush(foundItem);

        assertThat(savedFoundItem.getId()).isNotNull();
        assertThat(savedFoundItem.getCreatedAt()).isNotNull();
        assertThat(savedFoundItem.getUser().getId()).isEqualTo(savedUser.getId());
        assertThat(savedFoundItem.getStatus()).isEqualTo(FoundItemStatus.STORED);
        assertThat(savedFoundItem.getRegion()).isEqualTo("서울");

        // 4. Repository 조회 검증
        Optional<LostItem> foundLostOpt = lostItemRepository.findById(savedLostItem.getId());
        assertThat(foundLostOpt).isPresent();
        assertThat(foundLostOpt.get().getTitle()).isEqualTo("갈색 가죽 지갑");

        Optional<FoundItem> foundItemOpt = foundItemRepository.findById(savedFoundItem.getId());
        assertThat(foundItemOpt).isPresent();
        assertThat(foundItemOpt.get().getTitle()).isEqualTo("에어팟 프로 케이스");
    }
}
