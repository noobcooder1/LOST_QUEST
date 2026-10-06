package com.lostquest.client;

import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.ExternalApiException.Kind;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses 경찰청 OpenAPI XML. Two shapes were observed in real responses:
 * <ul>
 *   <li>{@code <response><header><resultCode/><resultMsg/></header><body><numOfRows/><pageNo/><totalCount/><items><item>…}</li>
 *   <li>data.go.kr gateway errors (sometimes with HTTP 200):
 *       {@code <OpenAPI_ServiceResponse><cmmMsgHeader><errMsg/><returnAuthMsg/><returnReasonCode/>…}</li>
 * </ul>
 * The parser never resolves DTDs or external entities (XXE): any DOCTYPE is rejected outright.
 */
public final class PoliceXmlParser {

    private static final DocumentBuilderFactory FACTORY = hardenedFactory();

    private PoliceXmlParser() {
    }

    public static PoliceXmlResponse parse(byte[] body, String context) {
        Document document = read(body, context);
        Element root = document.getDocumentElement();
        if ("OpenAPI_ServiceResponse".equals(root.getTagName())) {
            throw gatewayError(root, context);
        }
        if (!"response".equals(root.getTagName())) {
            throw new ExternalApiException(Kind.INVALID_RESPONSE, context + ": unexpected root element");
        }
        String resultCode = text(child(child(root, "header"), "resultCode"));
        if (!"00".equals(resultCode)) {
            throw new ExternalApiException(Kind.UPSTREAM_ERROR, context + ": resultCode=" + sanitize(resultCode));
        }
        Element bodyElement = child(root, "body");
        List<Map<String, String>> items = new ArrayList<>();
        Element itemsElement = child(bodyElement, "items");
        if (itemsElement != null) {
            for (Element item : children(itemsElement, "item")) {
                Map<String, String> fields = new LinkedHashMap<>();
                for (Element field : children(item, null)) {
                    String value = text(field);
                    fields.put(field.getTagName(), value);
                }
                items.add(fields);
            }
        }
        return new PoliceXmlResponse(
                integer(child(bodyElement, "totalCount")),
                integer(child(bodyElement, "pageNo")),
                integer(child(bodyElement, "numOfRows")),
                List.copyOf(items));
    }

    private static Document read(byte[] body, String context) {
        if (body == null || body.length == 0) {
            throw new ExternalApiException(Kind.INVALID_RESPONSE, context + ": empty body");
        }
        try {
            DocumentBuilder builder = FACTORY.newDocumentBuilder();
            // Belt and braces: even if a DOCTYPE slipped through, no external entity is ever fetched.
            builder.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
            builder.setErrorHandler(null);
            return builder.parse(new InputSource(new ByteArrayInputStream(body)));
        } catch (SAXException | IOException | ParserConfigurationException ex) {
            throw new ExternalApiException(Kind.INVALID_RESPONSE, context + ": malformed XML (" + ex.getClass().getSimpleName() + ")");
        }
    }

    private static ExternalApiException gatewayError(Element root, String context) {
        Element header = child(root, "cmmMsgHeader");
        String errMsg = sanitize(text(child(header, "errMsg")));
        String reason = sanitize(text(child(header, "returnReasonCode")));
        String detail = context + ": gateway " + errMsg + " (" + reason + ")";
        // Observed: SERVICE_KEY_IS_NULL (20), SERVICE_KEY_IS_NOT_REGISTERED_ERROR (30), HTTP_ERROR (04).
        if (errMsg.contains("SERVICE_KEY") || errMsg.contains("SERVICE_ACCESS_DENIED")) {
            return new ExternalApiException(Kind.AUTH_FAILED, detail);
        }
        if (errMsg.contains("LIMITED_NUMBER")) {
            return new ExternalApiException(Kind.RATE_LIMITED, detail);
        }
        return new ExternalApiException(Kind.UPSTREAM_ERROR, detail);
    }

    private static DocumentBuilderFactory hardenedFactory() {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setNamespaceAware(false);
            return factory;
        } catch (ParserConfigurationException ex) {
            throw new IllegalStateException("Secure XML parser features are not supported", ex);
        }
    }

    private static Element child(Element parent, String name) {
        if (parent == null) {
            return null;
        }
        List<Element> matches = children(parent, name);
        return matches.isEmpty() ? null : matches.get(0);
    }

    private static List<Element> children(Element parent, String name) {
        List<Element> result = new ArrayList<>();
        NodeList nodes = parent.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            if (node instanceof Element element && (name == null || name.equals(element.getTagName()))) {
                result.add(element);
            }
        }
        return result;
    }

    /** Trimmed text with CR normalized (real "uniq" values contain &#xd;); blank becomes null. */
    private static String text(Element element) {
        if (element == null) {
            return null;
        }
        String value = element.getTextContent().replace("\r\n", "\n").replace('\r', '\n').strip();
        return value.isEmpty() ? null : value;
    }

    private static int integer(Element element) {
        String value = text(element);
        if (value == null) {
            return 0;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            throw new ExternalApiException(Kind.INVALID_RESPONSE, "non-numeric paging value");
        }
    }

    /** Upstream codes go into server logs only; keep them short and printable. */
    private static String sanitize(String value) {
        if (value == null) {
            return "null";
        }
        String cleaned = value.replaceAll("[^A-Za-z0-9_\\-.]", "");
        return cleaned.length() > 60 ? cleaned.substring(0, 60) : cleaned;
    }
}
