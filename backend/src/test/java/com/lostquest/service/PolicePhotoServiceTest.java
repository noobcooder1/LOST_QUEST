package com.lostquest.service;

import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.InvalidRequestParameterException;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PolicePhotoServiceTest {
    private static final byte[] PNG = TestImages.png(32, 32);
    private final PolicePhotoDownloader downloader = mock(PolicePhotoDownloader.class);
    private final Time time = new Time();
    private final PolicePhotoService service = new PolicePhotoService(downloader, time, 32 * 1024 * 1024, 128, 30, 1000);
    private static String url(int n) { return "https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/"+n+".do"; }
    private static PolicePhotoDownloader.Download image() { return new PolicePhotoDownloader.Download(PNG, "image/png"); }
    private static class Time extends Clock {
        Instant now = Instant.parse("2026-10-20T01:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
        void advance(Duration duration) { now = now.plus(duration); }
    }
    @Test void reusesPhotoFor12HoursWithoutRefreshOrExtraCalls() {
        when(downloader.download(anyString())).thenReturn(image());
        assertThat(service.get(url(1)).hit()).isFalse();
        time.advance(Duration.ofHours(11)); assertThat(service.get(url(1)).hit()).isTrue();
        verify(downloader, times(1)).download(url(1));
        time.advance(Duration.ofHours(1)); assertThat(service.get(url(1)).hit()).isFalse();
        verify(downloader, times(2)).download(url(1));
    }
    @Test void rejectsUnsafeUrlsBeforeCacheOrNetwork() {
        for (String bad : new String[]{"http://127.0.0.1/x", url(1)+"?x=1", url(1).replace("minwon24.police.go.kr", "evil.example"), url(1).replace("https:", "http:"), "file:///etc/passwd", url(1)+"#x"})
            assertThatThrownBy(() -> service.get(bad)).isInstanceOf(InvalidRequestParameterException.class);
        verifyNoInteractions(downloader);
    }
    @Test void negativelyCachesFailuresForOneMinute() {
        when(downloader.download(anyString())).thenThrow(new ExternalApiException(ExternalApiException.Kind.TIMEOUT,"test"));
        for (int i=0;i<4;i++) assertThatThrownBy(()->service.get(url(1))).isInstanceOf(ExternalApiException.class);
        verify(downloader,times(1)).download(url(1));
        time.advance(Duration.ofSeconds(60)); assertThatThrownBy(()->service.get(url(1))).isInstanceOf(ExternalApiException.class);
        verify(downloader,times(2)).download(url(1));
    }
    @Test void realConcurrentRequestsShareOneInFlightDownload() throws Exception {
        var entered=new CountDownLatch(1); var release=new CountDownLatch(1); var ready=new CountDownLatch(8); var start=new CountDownLatch(1);
        when(downloader.download(anyString())).thenAnswer(invocation->{ entered.countDown(); if(!release.await(3,TimeUnit.SECONDS)) throw new IllegalStateException("timeout"); return image(); });
        try(var pool=Executors.newFixedThreadPool(8)) {
            var futures=java.util.stream.IntStream.range(0,8).mapToObj(i->pool.submit(()->{ready.countDown();start.await();return service.get(url(1));})).toList();
            assertThat(ready.await(2,TimeUnit.SECONDS)).isTrue(); start.countDown(); assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
            assertThat(futures).allMatch(future->!future.isDone()); release.countDown();
            for(var future:futures) assertThat(future.get(3,TimeUnit.SECONDS).photo().bytes()).isEqualTo(PNG);
            verify(downloader,times(1)).download(url(1));
        } finally { release.countDown(); }
    }
    @Test void permitsAtMostTwoDistinctConcurrentDownloadsAndReleasesSlots() throws Exception {
        var entered=new CountDownLatch(2); var release=new CountDownLatch(1);
        when(downloader.download(anyString())).thenAnswer(invocation->{ entered.countDown(); if(!release.await(3,TimeUnit.SECONDS)) throw new IllegalStateException("timeout"); return image(); });
        try(var pool=Executors.newFixedThreadPool(2)) {
            var first=pool.submit(()->service.get(url(1))); var second=pool.submit(()->service.get(url(2)));
            assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue(); assertThatThrownBy(()->service.get(url(3))).isInstanceOf(ExternalApiException.class);
            verify(downloader,never()).download(url(3)); release.countDown(); first.get(); second.get();
            assertThat(service.get(url(3)).photo().bytes()).isEqualTo(PNG);
        } finally { release.countDown(); }
    }
    @Test void boundsRetainedBytesAndEvictsLeastRecentlyUsedPhotos() {
        var small=new PolicePhotoService(downloader,time,PNG.length*2L,128,30,1000);
        when(downloader.download(anyString())).thenReturn(image());
        small.get(url(1));small.get(url(2));small.get(url(3));assertThat(small.get(url(2)).hit()).isTrue();assertThat(small.get(url(1)).hit()).isFalse();
        verify(downloader,times(2)).download(url(1));
    }
    @Test void boundsEntryCountIncludingFailedEntries() {
        var small=new PolicePhotoService(downloader,time,32*1024*1024,2,30,1000);
        when(downloader.download(anyString())).thenReturn(image());
        small.get(url(1));small.get(url(2));small.get(url(3));assertThat(small.get(url(1)).hit()).isFalse();
    }
    @Test void rateLimitsOnlyRealDownloadsAndResetsMinute() {
        var limited=new PolicePhotoService(downloader,time,32*1024*1024,128,2,100);
        when(downloader.download(anyString())).thenReturn(image());limited.get(url(1));limited.get(url(2));
        assertThat(limited.get(url(1)).hit()).isTrue();assertThatThrownBy(()->limited.get(url(3))).isInstanceOf(ExternalApiException.class);
        time.advance(Duration.ofMinutes(1));assertThat(limited.get(url(3)).hit()).isFalse();
    }
    @Test void dailyBudgetUsesKoreanDayAndSurvivesMinuteReset() {
        var limited=new PolicePhotoService(downloader,time,32*1024*1024,128,100,2);
        when(downloader.download(anyString())).thenReturn(image());limited.get(url(1));limited.get(url(2));time.advance(Duration.ofMinutes(1));
        assertThatThrownBy(()->limited.get(url(3))).isInstanceOf(ExternalApiException.class);
        time.now=Instant.parse("2026-10-20T15:00:00Z");assertThat(limited.get(url(3)).hit()).isFalse();
    }
    @Test void rejectsBrokenMislabeledAndDecompressionBombImages() {
        var bad=new PolicePhotoDownloader.Download[]{new PolicePhotoDownloader.Download(PNG,"image/jpeg"),new PolicePhotoDownloader.Download(TestImages.signatureOnly("png"),"image/png"),new PolicePhotoDownloader.Download(TestImages.pngHeaderOnly(20000,20000),"image/png"),new PolicePhotoDownloader.Download(new byte[PolicePhotoDownloader.MAX_BYTES+1],"image/png")};
        for(int i=0;i<bad.length;i++) { when(downloader.download(url(i))).thenReturn(bad[i]);final int n=i;assertThatThrownBy(()->service.get(url(n))).isInstanceOf(ExternalApiException.class); }
    }
}
