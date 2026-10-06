package com.lostquest.client;

import java.util.List;
import java.util.Map;

/** A successful (resultCode 00) 경찰청 response: paging values and each item's child elements by tag name. */
public record PoliceXmlResponse(int totalCount, int pageNo, int numOfRows, List<Map<String, String>> items) {
}
