package com.lostquest.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

@Entity
@Table(name = "found_items")
public class FoundItem extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotBlank
    @Size(max = 120)
    @Column(nullable = false, length = 120)
    private String title;

    @NotBlank
    @Size(max = 50)
    @Column(nullable = false, length = 50)
    private String category;

    @Size(max = 30)
    @Column(length = 30)
    private String color;

    @Size(max = 2000)
    @Column(length = 2000)
    private String description;

    @NotNull
    @PastOrPresent
    @Column(name = "found_date", nullable = false)
    private LocalDate foundDate;

    @NotBlank
    @Size(max = 255)
    @Column(nullable = false, length = 255)
    private String location;

    @Size(max = 2048)
    @Column(name = "image_url", length = 2048)
    private String imageUrl;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FoundItemStatus status;

    protected FoundItem() {
    }

    public FoundItem(User user, String title, String category, String color, String description,
                     LocalDate foundDate, String location, String imageUrl, FoundItemStatus status) {
        this.user = user;
        this.title = title;
        this.category = category;
        this.color = color;
        this.description = description;
        this.foundDate = foundDate;
        this.location = location;
        this.imageUrl = imageUrl;
        this.status = status;
    }

    public User getUser() {
        return user;
    }

    public String getTitle() {
        return title;
    }

    public String getCategory() {
        return category;
    }

    public String getColor() {
        return color;
    }

    public String getDescription() {
        return description;
    }

    public LocalDate getFoundDate() {
        return foundDate;
    }

    public String getLocation() {
        return location;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public FoundItemStatus getStatus() {
        return status;
    }
}
