package com.lostquest.service;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

/**
 * Accepts only the 경찰청 attachment image URLs seen in real responses, e.g.
 * {@code https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/1/C2026100500419851/1.do}.
 * The "no image" placeholders ({@code /images/sub/img0X_no_img.gif}) and any other host, scheme or shape
 * are dropped so the UI falls back to its category illustration. This is separate from the
 * LOST QUEST upload rule (/api/images/{uuid}.{ext}), which stays unchanged.
 */
public final class PoliceImagePolicy {

    static final String HOST = "minwon24.police.go.kr";
    private static final Pattern PATH = Pattern.compile(
            "/lost112/find/getOpenapiAttachFileImage/[LF][0-9]{16}/[0-9]{1,3}/[A-Z][0-9]{16}/[0-9]{1,3}\\.do");

    private PoliceImagePolicy() {
    }

    public static String safeImageUrl(String value) {
        if (value == null || value.length() > 300) {
            return null;
        }
        try {
            URI uri = new URI(value.strip());
            boolean ok = "https".equals(uri.getScheme())
                    && HOST.equals(uri.getHost())
                    && uri.getPort() == -1
                    && uri.getRawUserInfo() == null
                    && uri.getRawQuery() == null
                    && uri.getRawFragment() == null
                    && uri.getRawPath() != null
                    && PATH.matcher(uri.getRawPath()).matches();
            return ok ? uri.toString() : null;
        } catch (URISyntaxException ex) {
            return null;
        }
    }
}
