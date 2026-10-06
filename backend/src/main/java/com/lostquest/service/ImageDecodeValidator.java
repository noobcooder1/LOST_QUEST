package com.lostquest.service;

import com.lostquest.exception.InvalidImageException;
import com.twelvemonkeys.imageio.plugins.webp.WebPImageReaderSpi;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * Second line of defense after the signature check: the upload must actually decode as the detected format.
 * <ul>
 *   <li>Dimensions are read from the header first; oversized images are rejected before any decoding
 *       (decompression bombs: a 388 KB PNG can declare 20000x20000).</li>
 *   <li>JPEG/PNG decode with source subsampling to at most ~1 megapixel: every compressed byte is still read,
 *       but the decoded raster stays a few MB regardless of resolution.</li>
 *   <li>The WebP reader (TwelveMonkeys) allocates the full-size raster, so WebP has a lower pixel limit.</li>
 *   <li>Reader warnings count as failures: a truncated JPEG only produces warnings, not an exception.</li>
 *   <li>At most {@value #MAX_CONCURRENT_DECODES} decodes run at once so parallel uploads cannot add up.</li>
 * </ul>
 * Lossy WebP (VP8) carries no checksum, so random corruption inside a structurally valid file still decodes
 * (as it would in a browser); structural damage and truncation are rejected.
 */
final class ImageDecodeValidator {

    static final int MAX_SIDE = 16_384;
    static final long MAX_PIXELS = 50_000_000L;
    static final long MAX_WEBP_PIXELS = 4096L * 4096L;
    static final long TARGET_DECODED_PIXELS = 1_000_000L;
    static final int MAX_CONCURRENT_DECODES = 2;

    private static final String UNREADABLE = "손상되었거나 이미지로 읽을 수 없는 파일이에요.";
    private static final WebPImageReaderSpi WEBP = new WebPImageReaderSpi();
    private static final Semaphore DECODES = new Semaphore(MAX_CONCURRENT_DECODES, true);

    static {
        // Decoding works from memory; never spill to temporary files.
        ImageIO.setUseCache(false);
    }

    private ImageDecodeValidator() {
    }

    /** @param format "jpeg", "png" or "webp" (already confirmed by the signature check) */
    static void validate(byte[] content, String format) {
        DECODES.acquireUninterruptibly();
        ImageReader reader = null;
        try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(content))) {
            reader = readerFor(format);
            List<String> warnings = new ArrayList<>();
            reader.addIIOReadWarningListener((source, warning) -> warnings.add(warning));
            reader.setInput(input, true, true);

            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            long pixels = (long) width * height;
            long maxPixels = "webp".equals(format) ? MAX_WEBP_PIXELS : MAX_PIXELS;
            if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE || pixels > maxPixels) {
                throw new InvalidImageException("이미지 해상도가 너무 커요. 더 작은 이미지를 올려 주세요.");
            }

            ImageReadParam param = reader.getDefaultReadParam();
            int step = (int) Math.max(1, Math.ceil(Math.sqrt((double) pixels / TARGET_DECODED_PIXELS)));
            param.setSourceSubsampling(step, step, 0, 0);
            if (reader.read(0, param) == null || !warnings.isEmpty()) {
                throw new InvalidImageException(UNREADABLE);
            }
        } catch (InvalidImageException ex) {
            throw ex;
        } catch (IOException | RuntimeException ex) {
            // Corrupt data surfaces as IIOException/EOFException, and sometimes as runtime exceptions in decoders.
            throw new InvalidImageException(UNREADABLE);
        } finally {
            if (reader != null) {
                reader.dispose();
            }
            DECODES.release();
        }
    }

    private static ImageReader readerFor(String format) throws IOException {
        if ("webp".equals(format)) {
            // Created explicitly: ImageIO plugin discovery is unreliable inside a Spring Boot executable jar.
            return WEBP.createReaderInstance();
        }
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
        if (!readers.hasNext()) {
            throw new IOException("No reader for " + format);
        }
        return readers.next();
    }
}
