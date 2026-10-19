package com.lostquest.service;

import com.lostquest.exception.ExternalApiException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.io.*;
import java.net.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PolicePhotoDownloaderTest {
    private final PolicePhotoDownloader downloader=new PolicePhotoDownloader();
    @Test void downloadsImageBytesWithoutForwardingCredentials() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);byte[] png=TestImages.png(32,32);
        var count=new AtomicInteger();server.createContext("/photo",exchange->{count.incrementAndGet();assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isNull();assertThat(exchange.getRequestHeaders().getFirst("Cookie")).isNull();exchange.getResponseHeaders().set("Content-Type","image/png");exchange.sendResponseHeaders(200,png.length);exchange.getResponseBody().write(png);exchange.close();});server.start();
        try {var connection=(HttpURLConnection)new URL("http://127.0.0.1:"+server.getAddress().getPort()+"/photo").openConnection();assertThat(downloader.read(connection).bytes()).isEqualTo(png);assertThat(count).hasValue(1);}finally{server.stop(0);}
    }
    @Test void neverFollowsRedirectsEvenToLocalAddresses() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var reached=new AtomicInteger();
        server.createContext("/photo",exchange->{exchange.getResponseHeaders().set("Location","http://127.0.0.1:"+server.getAddress().getPort()+"/private");exchange.sendResponseHeaders(302,-1);exchange.close();});
        server.createContext("/private",exchange->{reached.incrementAndGet();exchange.sendResponseHeaders(200,-1);exchange.close();});server.start();
        try {var connection=(HttpURLConnection)new URL("http://127.0.0.1:"+server.getAddress().getPort()+"/photo").openConnection();assertThatThrownBy(()->downloader.read(connection)).isInstanceOf(ExternalApiException.class);assertThat(reached).hasValue(0);}finally{server.stop(0);}
    }
    @Test void rejectsHtmlBeforeReadingTheBody() throws Exception {
        var connection=mock(HttpURLConnection.class);when(connection.getResponseCode()).thenReturn(200);when(connection.getContentType()).thenReturn("text/html");
        assertThatThrownBy(()->downloader.read(connection)).isInstanceOf(ExternalApiException.class);verify(connection,never()).getInputStream();verify(connection).disconnect();
    }
    @Test void enforcesStreamLimitEvenWithoutContentLength() throws Exception {
        var connection=mock(HttpURLConnection.class);when(connection.getResponseCode()).thenReturn(200);when(connection.getContentType()).thenReturn("image/png");when(connection.getContentLengthLong()).thenReturn(-1L);when(connection.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[PolicePhotoDownloader.MAX_BYTES+1]));
        assertThatThrownBy(()->downloader.read(connection)).isInstanceOf(ExternalApiException.class);verify(connection).disconnect();
    }
    @Test void rejectsOversizedDeclaredLengthWithoutReadingBody() throws Exception {
        var connection=mock(HttpURLConnection.class);when(connection.getResponseCode()).thenReturn(200);when(connection.getContentType()).thenReturn("image/jpeg");when(connection.getContentLengthLong()).thenReturn((long)PolicePhotoDownloader.MAX_BYTES+1);
        assertThatThrownBy(()->downloader.read(connection)).isInstanceOf(ExternalApiException.class);verify(connection,never()).getInputStream();
    }
    @Test void unsafeHostsAreRejectedBeforeOpeningConnections() {
        assertThatThrownBy(()->downloader.download("http://127.0.0.1/private")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void configuresFiniteTimeoutsAndPropagatesBodyTimeout() throws Exception {
        var connection=mock(HttpURLConnection.class);when(connection.getResponseCode()).thenReturn(200);when(connection.getContentType()).thenReturn("image/png");var input=mock(InputStream.class);when(input.read(any(byte[].class))).thenThrow(new SocketTimeoutException());when(connection.getInputStream()).thenReturn(input);
        assertThatThrownBy(()->downloader.read(connection)).isInstanceOf(SocketTimeoutException.class);verify(connection).setConnectTimeout(3000);verify(connection,atLeastOnce()).setReadTimeout(5000);verify(connection).setInstanceFollowRedirects(false);verify(connection).disconnect();
    }
}
