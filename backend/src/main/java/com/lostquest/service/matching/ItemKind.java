package com.lostquest.service.matching;

import java.util.*;
import java.util.regex.*;

/** Conservative object families, not semantic scores. General categories and ambiguous titles stay unknown. */
public final class ItemKind {
    private static final Map<String,String> LABELS=Map.ofEntries(
        Map.entry("umbrella","우산"),Map.entry("clothes","의류"),Map.entry("wallet","지갑"),Map.entry("bag","가방"),
        Map.entry("phone","휴대폰"),Map.entry("earbuds","이어폰"),Map.entry("headphones","헤드폰"),Map.entry("laptop","노트북"),
        Map.entry("tablet","태블릿"),Map.entry("keys","열쇠"),Map.entry("glasses","안경"),Map.entry("watch","시계"),
        Map.entry("camera","카메라"),Map.entry("bottle","물병"),Map.entry("book","책"),Map.entry("shoes","신발"),
        Map.entry("hat","모자"),Map.entry("card","카드"),Map.entry("jewelry","장신구"),
        Map.entry("fishing","낚시용품"),Map.entry("golf","골프용품"));
    private static final Map<String,String> ALIASES=new HashMap<>();
    private static final Pattern WORDS;
    static {
        add("umbrella","우산|우양산|양산|umbrella");
        add("clothes","후드집업|후드티|후드|집업|재킷|자켓|점퍼|코트|패딩|티셔츠|셔츠|가디건|스웨터|니트|바지|치마|원피스|의류|hoodie|jacket|coat|shirt");
        add("wallet","지갑|반지갑|장지갑|wallet|purse");add("bag","가방|백팩|핸드백|에코백|여행가방|캐리어|backpack|handbag|suitcase");
        add("phone","휴대폰|스마트폰|핸드폰|아이폰|갤럭시폰|smartphone|iphone");
        add("earbuds","이어폰|에어팟|갤럭시버즈|earbuds|airpods");add("headphones","헤드폰|헤드셋|headphones|headset");
        add("laptop","노트북|맥북|laptop|macbook");add("tablet","태블릿|타블렛|아이패드|갤럭시탭|ipad|tablet");
        add("keys","열쇠|스마트키|차키|키링|keyring");add("glasses","안경|선글라스|sunglasses|eyeglasses");
        add("watch","손목시계|스마트워치|애플워치|시계|wristwatch");add("camera","카메라|디지털카메라|camera");
        add("bottle","물병|텀블러|보온병|bottle|tumbler");add("book","노트|수첩|도서|책|notebook|book");
        add("shoes","운동화|구두|신발|스니커즈|shoes|sneakers");add("hat","모자|야구모자|비니|hat");
        add("card","신분증|주민등록증|면허증|카드|card");add("fishing","낚싯대|낚시대|낚시가방|낚시용품|낚시|fishing");
        add("golf","골프채|골프클럽|골프백|골프공|골프|golf");add("jewelry","반지|목걸이|팔찌|귀걸이|장신구|jewelry");
        // Longer words first so 노트북 never also matches 노트 and 손목시계 does not match twice.
        WORDS=Pattern.compile(ALIASES.keySet().stream().sorted(Comparator.comparingInt(String::length).reversed().thenComparing(s->s))
            .map(word->word.matches("[a-z]+")?"(?<![a-z])"+Pattern.quote(word)+"(?![a-z])":Pattern.quote(word)).collect(java.util.stream.Collectors.joining("|")));
    }
    private static void add(String kind,String words){for(String word:words.split("\\|"))ALIASES.put(word,kind);}
    private ItemKind() {}
    private static Set<String> kinds(String value){
        String text=value==null?null:value.toLowerCase(Locale.ROOT);Set<String> found=new HashSet<>();if(text==null)return found;
        var matches=WORDS.matcher(text);while(matches.find())found.add(ALIASES.get(matches.group()));return found;
    }
    public static String of(String title,String category){
        Set<String> fromTitle=kinds(title);
        if(fromTitle.size()>1)return null; // e.g. "우산이 든 가방": do not guess the main object.
        if(fromTitle.size()==1)return fromTitle.iterator().next();
        Set<String> fromCategory=kinds(category);
        return fromCategory.size()==1?fromCategory.iterator().next():null;
    }
    public static boolean conflicts(MatchTarget target,MatchCandidate candidate){
        String a=of(target.title(),target.category()),b=of(candidate.title(),candidate.category());
        return a!=null&&b!=null&&!a.equals(b);
    }
    public static String label(String kind){return kind==null?null:LABELS.get(kind);}
}
