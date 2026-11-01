import java.util.*;

/**
 * Road Sync — Zero-Dependency JSON Parser and Serializer
 * 
 * Provides robust JSON parsing and serialization using only standard Java:
 * - Parses JSON objects into Map<String, Object> (LinkedHashMap for order preservation)
 * - Parses JSON arrays into List<Object>
 * - Handles strings (with quotes, backslashes, newlines, unicode, and large Base64 image payloads)
 * - Handles numbers (Long, Double), booleans, and null
 * - Serializes Maps, Lists, and primitives into formatted or compact JSON
 */
public class JsonHelper {

    public static class JsonParseException extends Exception {
        public JsonParseException(String message) {
            super(message);
        }
        public JsonParseException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    // -------------------------------------------------------------------------
    // SERIALIZATION
    // -------------------------------------------------------------------------

    public static String toJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        serialize(obj, sb, 0, true);
        return sb.toString();
    }

    public static String toJsonCompact(Object obj) {
        StringBuilder sb = new StringBuilder();
        serialize(obj, sb, 0, false);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void serialize(Object obj, StringBuilder sb, int indent, boolean pretty) {
        if (obj == null) {
            sb.append("null");
        } else if (obj instanceof String) {
            sb.append('"');
            escapeString((String) obj, sb);
            sb.append('"');
        } else if (obj instanceof Number || obj instanceof Boolean) {
            sb.append(obj.toString());
        } else if (obj instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) obj;
            if (map.isEmpty()) {
                sb.append("{}");
                return;
            }
            sb.append('{');
            if (pretty) sb.append('\n');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) {
                    sb.append(',');
                    if (pretty) sb.append('\n');
                }
                first = false;
                if (pretty) appendIndent(sb, indent + 1);
                sb.append('"');
                escapeString(String.valueOf(entry.getKey()), sb);
                sb.append("\": ");
                serialize(entry.getValue(), sb, indent + 1, pretty);
            }
            if (pretty) {
                sb.append('\n');
                appendIndent(sb, indent);
            }
            sb.append('}');
        } else if (obj instanceof List) {
            List<?> list = (List<?>) obj;
            if (list.isEmpty()) {
                sb.append("[]");
                return;
            }
            sb.append('[');
            if (pretty) sb.append('\n');
            boolean first = true;
            for (Object item : list) {
                if (!first) {
                    sb.append(',');
                    if (pretty) sb.append('\n');
                }
                first = false;
                if (pretty) appendIndent(sb, indent + 1);
                serialize(item, sb, indent + 1, pretty);
            }
            if (pretty) {
                sb.append('\n');
                appendIndent(sb, indent);
            }
            sb.append(']');
        } else if (obj instanceof Object[]) {
            serialize(Arrays.asList((Object[]) obj), sb, indent, pretty);
        } else {
            sb.append('"');
            escapeString(obj.toString(), sb);
            sb.append('"');
        }
    }

    private static void appendIndent(StringBuilder sb, int indent) {
        for (int i = 0; i < indent; i++) {
            sb.append("  ");
        }
    }

    private static void escapeString(String s, StringBuilder sb) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 32) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
    }

    // -------------------------------------------------------------------------
    // PARSING
    // -------------------------------------------------------------------------

    public static Object parse(String json) throws JsonParseException {
        if (json == null) return null;
        Parser parser = new Parser(json);
        Object result = parser.parseValue();
        parser.skipWhitespace();
        if (!parser.isEof()) {
            throw new JsonParseException("Unexpected trailing characters at index " + parser.pos);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String json) throws JsonParseException {
        Object res = parse(json);
        if (res instanceof Map) {
            return (Map<String, Object>) res;
        }
        throw new JsonParseException("Root element is not a JSON Object");
    }

    @SuppressWarnings("unchecked")
    public static List<Object> parseArray(String json) throws JsonParseException {
        Object res = parse(json);
        if (res instanceof List) {
            return (List<Object>) res;
        }
        throw new JsonParseException("Root element is not a JSON Array");
    }

    private static class Parser {
        private final String src;
        private int pos = 0;

        public Parser(String src) {
            this.src = src;
        }

        public boolean isEof() {
            return pos >= src.length();
        }

        public void skipWhitespace() {
            while (!isEof()) {
                char c = src.charAt(pos);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                    pos++;
                } else {
                    break;
                }
            }
        }

        public Object parseValue() throws JsonParseException {
            skipWhitespace();
            if (isEof()) {
                throw new JsonParseException("Unexpected end of JSON input");
            }
            char c = src.charAt(pos);
            if (c == '{') {
                return parseObject();
            } else if (c == '[') {
                return parseArray();
            } else if (c == '"') {
                return parseString();
            } else if (c == 't' || c == 'f') {
                return parseBoolean();
            } else if (c == 'n') {
                return parseNull();
            } else if (c == '-' || (c >= '0' && c <= '9')) {
                return parseNumber();
            }
            throw new JsonParseException("Unexpected character '" + c + "' at index " + pos);
        }

        private Map<String, Object> parseObject() throws JsonParseException {
            Map<String, Object> map = new LinkedHashMap<>();
            pos++; // skip '{'
            skipWhitespace();
            if (!isEof() && src.charAt(pos) == '}') {
                pos++;
                return map;
            }

            while (true) {
                skipWhitespace();
                if (isEof() || src.charAt(pos) != '"') {
                    throw new JsonParseException("Expected key string at index " + pos);
                }
                String key = parseString();
                skipWhitespace();
                if (isEof() || src.charAt(pos) != ':') {
                    throw new JsonParseException("Expected ':' after key at index " + pos);
                }
                pos++; // skip ':'
                Object value = parseValue();
                map.put(key, value);

                skipWhitespace();
                if (isEof()) {
                    throw new JsonParseException("Unterminated object at end of input");
                }
                char next = src.charAt(pos);
                if (next == '}') {
                    pos++;
                    break;
                } else if (next == ',') {
                    pos++;
                } else {
                    throw new JsonParseException("Expected ',' or '}' at index " + pos);
                }
            }
            return map;
        }

        private List<Object> parseArray() throws JsonParseException {
            List<Object> list = new ArrayList<>();
            pos++; // skip '['
            skipWhitespace();
            if (!isEof() && src.charAt(pos) == ']') {
                pos++;
                return list;
            }

            while (true) {
                Object item = parseValue();
                list.add(item);
                skipWhitespace();
                if (isEof()) {
                    throw new JsonParseException("Unterminated array at end of input");
                }
                char next = src.charAt(pos);
                if (next == ']') {
                    pos++;
                    break;
                } else if (next == ',') {
                    pos++;
                } else {
                    throw new JsonParseException("Expected ',' or ']' at index " + pos);
                }
            }
            return list;
        }

        private String parseString() throws JsonParseException {
            pos++; // skip opening '"'
            StringBuilder sb = new StringBuilder();
            while (!isEof()) {
                char c = src.charAt(pos++);
                if (c == '"') {
                    return sb.toString();
                }
                if (c == '\\') {
                    if (isEof()) {
                        throw new JsonParseException("Unterminated escape sequence at end of input");
                    }
                    char esc = src.charAt(pos++);
                    switch (esc) {
                        case '"': sb.append('"'); break;
                        case '\\': sb.append('\\'); break;
                        case '/': sb.append('/'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'n': sb.append('\n'); break;
                        case 'r': sb.append('\r'); break;
                        case 't': sb.append('\t'); break;
                        case 'u':
                            if (pos + 4 > src.length()) {
                                throw new JsonParseException("Incomplete unicode escape at index " + pos);
                            }
                            String hex = src.substring(pos, pos + 4);
                            try {
                                sb.append((char) Integer.parseInt(hex, 16));
                                pos += 4;
                            } catch (NumberFormatException e) {
                                throw new JsonParseException("Invalid unicode escape \\u" + hex);
                            }
                            break;
                        default:
                            sb.append(esc);
                            break;
                    }
                } else {
                    sb.append(c);
                }
            }
            throw new JsonParseException("Unterminated string literal");
        }

        private Boolean parseBoolean() throws JsonParseException {
            if (src.startsWith("true", pos)) {
                pos += 4;
                return Boolean.TRUE;
            } else if (src.startsWith("false", pos)) {
                pos += 5;
                return Boolean.FALSE;
            }
            throw new JsonParseException("Invalid boolean token at index " + pos);
        }

        private Object parseNull() throws JsonParseException {
            if (src.startsWith("null", pos)) {
                pos += 4;
                return null;
            }
            throw new JsonParseException("Invalid null token at index " + pos);
        }

        private Number parseNumber() throws JsonParseException {
            int start = pos;
            if (src.charAt(pos) == '-') pos++;
            while (!isEof() && Character.isDigit(src.charAt(pos))) {
                pos++;
            }
            boolean isFloat = false;
            if (!isEof() && src.charAt(pos) == '.') {
                isFloat = true;
                pos++;
                while (!isEof() && Character.isDigit(src.charAt(pos))) {
                    pos++;
                }
            }
            if (!isEof() && (src.charAt(pos) == 'e' || src.charAt(pos) == 'E')) {
                isFloat = true;
                pos++;
                if (!isEof() && (src.charAt(pos) == '+' || src.charAt(pos) == '-')) {
                    pos++;
                }
                while (!isEof() && Character.isDigit(src.charAt(pos))) {
                    pos++;
                }
            }
            String numStr = src.substring(start, pos);
            try {
                if (isFloat) {
                    return Double.parseDouble(numStr);
                } else {
                    long l = Long.parseLong(numStr);
                    if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) {
                        return (int) l;
                    }
                    return l;
                }
            } catch (NumberFormatException e) {
                throw new JsonParseException("Invalid number format '" + numStr + "' at index " + start);
            }
        }
    }
}
