package com.lostquest.service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Random;
import java.util.zip.CRC32;

/** Real, decodable test images (JPEG/PNG generated with ImageIO, WebP from Pillow-made fixtures) and broken variants. */
public final class TestImages {

    private TestImages() {
    }

    public static byte[] jpeg(int width, int height) {
        return write(pattern(width, height, BufferedImage.TYPE_INT_RGB), "jpeg");
    }

    public static byte[] png(int width, int height) {
        return write(pattern(width, height, BufferedImage.TYPE_INT_ARGB), "png");
    }

    /** valid-lossy.webp (48x32), valid-lossless.webp (48x32), valid-alpha.webp (40x30). */
    public static byte[] webp(String name) {
        try (InputStream in = TestImages.class.getResourceAsStream("/images/" + name)) {
            if (in == null) {
                throw new IllegalArgumentException("Missing fixture " + name);
            }
            return in.readAllBytes();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    /** Exactly what the broken QA uploads contained: a 16-byte file with only a valid signature. */
    public static byte[] signatureOnly(String format) {
        byte[] head = switch (format) {
            case "jpeg" -> new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1, 1, 0, 0, 1};
            case "png" -> new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};
            case "webp" -> new byte[] {'R', 'I', 'F', 'F', 0x24, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '};
            default -> throw new IllegalArgumentException(format);
        };
        return Arrays.copyOf(head, 16);
    }

    public static byte[] truncated(byte[] image) {
        return Arrays.copyOf(image, image.length / 2);
    }

    /** Overwrites a block in the middle with deterministic random bytes. */
    public static byte[] corrupted(byte[] image) {
        byte[] copy = image.clone();
        Random random = new Random(42);
        int start = copy.length / 2;
        for (int i = start; i < Math.min(copy.length, start + 200); i++) {
            copy[i] = (byte) random.nextInt(256);
        }
        return copy;
    }

    /** A structurally valid PNG header declaring huge dimensions (decompression-bomb shape), no pixel data. */
    public static byte[] pngHeaderOnly(int width, int height) {
        ByteBuffer ihdr = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 8).put((byte) 0)
                .put((byte) 0).put((byte) 0).put((byte) 0);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
        chunk(out, "IHDR", ihdr.array());
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    /** WebP lossless (VP8L) header declaring the given size; enough for the reader to report dimensions. */
    public static byte[] webpLosslessHeader(int width, int height) {
        int bits = (width - 1) | ((height - 1) << 14);
        byte[] vp8l = {0x2F, (byte) bits, (byte) (bits >>> 8), (byte) (bits >>> 16), (byte) (bits >>> 24), 0, 0, 0, 0, 0};
        ByteBuffer riff = ByteBuffer.allocate(12 + 8 + vp8l.length).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        riff.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(4 + 8 + vp8l.length).put("WEBP".getBytes(StandardCharsets.US_ASCII))
                .put("VP8L".getBytes(StandardCharsets.US_ASCII)).putInt(vp8l.length).put(vp8l);
        return riff.array();
    }

    /** A real PNG padded with a private ancillary chunk (ignored by decoders) to exactly {@code size} bytes. */
    public static byte[] pngPaddedTo(int size) {
        byte[] png = png(32, 24);
        int iend = png.length - 12;
        int padding = size - png.length - 12;
        ByteArrayOutputStream out = new ByteArrayOutputStream(size);
        out.write(png, 0, iend);
        chunk(out, "lqPd", new byte[padding]);
        out.write(png, iend, 12);
        return out.toByteArray();
    }

    private static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        out.writeBytes(ByteBuffer.allocate(4).putInt(data.length).array());
        out.writeBytes(typeBytes);
        out.writeBytes(data);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        out.writeBytes(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
    }

    private static BufferedImage pattern(int width, int height, int type) {
        BufferedImage image = new BufferedImage(width, height, type);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, 0xFF000000 | ((x * 7) % 256) << 16 | ((y * 5) % 256) << 8 | ((x * y) % 256));
            }
        }
        return image;
    }

    private static byte[] write(BufferedImage image, String format) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, format, out)) {
                throw new IllegalStateException("No writer for " + format);
            }
            return out.toByteArray();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }
}
