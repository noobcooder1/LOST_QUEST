package com.lostquest.entity;
import jakarta.persistence.*;
@Entity
@Table(name = "item_images")
public class ItemImage {
    @Id @Column(length = 41)
    private String filename;
    @Lob @Column(nullable = false, length = 10485760)
    private byte[] content;
    protected ItemImage() {}
    public ItemImage(String filename, byte[] content) { this.filename = filename; this.content = content; }
    public String getFilename() { return filename; }
    public byte[] getContent() { return content; }
}
