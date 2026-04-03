import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useSelector } from 'react-redux';
import { chatAPI } from '../services/api';
import { connectSocket, joinBookingRoom, sendChatMessage, sendTyping, sendLocationMessage } from '../services/socketService';
import { getCurrentPosition } from '../services/locationService';
import { format } from 'date-fns';

const BRAND = '#0F5C3A';
const QUICK_REPLIES = [
  '📍 Where are you now?', '✅ I am at the pickup point',
  '⏱ Running 5 mins late, sorry!', '👍 Ok, noted',
  '🚗 I can see your car', '📞 Calling you now',
];

export default function ChatScreen({ route, navigation }) {
  const { bookingId, driverName = 'Driver', driverInitials = 'DR' } = route.params || {};
  const { user } = useSelector(s => s.auth);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    loadMessages();
    setupSocket();
    return () => {
      sendTyping(bookingId, false);
    };
  }, [bookingId]);

  const loadMessages = async () => {
    try {
      const data = await chatAPI.messages(bookingId);
      setMessages(data.data.messages);
      scrollToBottom();
    } catch (e) {
      console.warn('Chat load error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = async () => {
    const socket = await connectSocket();
    if (!socket) return;
    joinBookingRoom(bookingId);
    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    });
    socket.on('user_typing', ({ isTyping: t, userId }) => {
      if (userId !== user._id) setIsTyping(t);
    });
  };

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');

    // Optimistic update
    const tempMsg = {
      _id: Date.now().toString(),
      sender: { _id: user._id, firstName: user.firstName },
      text, type: 'text',
      createdAt: new Date().toISOString(),
      _temp: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();

    sendChatMessage(bookingId, text);
  };

  const handleTyping = (text) => {
    setInputText(text);
    sendTyping(bookingId, true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(bookingId, false), 2000);
  };

  const handleShareLocation = async () => {
    try {
      const pos = await getCurrentPosition();
      sendLocationMessage(bookingId, pos.lat, pos.lng, 'My current location');
      const locMsg = {
        _id: Date.now().toString(),
        sender: { _id: user._id },
        type: 'location',
        location: { lat: pos.lat, lng: pos.lng, address: 'My current location' },
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, locMsg]);
    } catch (e) {
      alert('Could not get location. Please enable GPS.');
    }
  };

  const isMe = (msg) => msg.sender?._id === user?._id || msg.sender === user?._id;

  const renderMessage = ({ item: msg }) => {
    const mine = isMe(msg);
    const time = format(new Date(msg.createdAt), 'HH:mm');

    if (msg.type === 'location') {
      return (
        <View style={[styles.msgWrap, mine && styles.msgWrapMe]}>
          <View style={styles.locationMsg}>
            <Text style={styles.locationTitle}>📍 Location shared</Text>
            <Text style={styles.locationSub}>{msg.location?.address || `${msg.location?.lat?.toFixed(4)}, ${msg.location?.lng?.toFixed(4)}`}</Text>
            <Text style={styles.msgTime}>{time}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.msgWrap, mine && styles.msgWrapMe]}>
        {!mine && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{driverInitials}</Text>
          </View>
        )}
        <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, mine && styles.bubbleTextMe]}>{msg.text}</Text>
          <Text style={[styles.msgTime, mine && { color: 'rgba(255,255,255,0.55)' }]}>{time}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <View style={styles.driverAv}>
          <Text style={styles.driverAvText}>{driverInitials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>{driverName}</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>
              {isTyping ? 'typing...' : 'Online'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('Tracking', { bookingId })}>
          <Text style={{ fontSize: 16 }}>📍</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m._id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No messages yet. Say hello! 👋</Text>
          </View>
        }
      />

      {/* Quick replies */}
      <FlatList
        horizontal
        data={QUICK_REPLIES}
        keyExtractor={r => r}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickReplies}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.quickChip} onPress={() => { setInputText(item); handleSend(); }}>
            <Text style={styles.quickChipText}>{item}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachBtn} onPress={handleShareLocation}>
          <Text style={{ fontSize: 18 }}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor="#9B9890"
          value={inputText}
          onChangeText={handleTyping}
          onSubmitEditing={handleSend}
          multiline
          maxLength={500}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={{ color: '#fff', fontSize: 16 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F0EB' },
  header: { backgroundColor: '#0d3322', paddingTop: 54, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  driverAv: { width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },
  driverAvText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  driverName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  onlineText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  headerBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  messageList: { padding: 16, paddingBottom: 8 },
  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  msgWrapMe: { flexDirection: 'row-reverse' },
  avatar: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#1A7D52', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  bubble: { maxWidth: '72%', padding: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: BRAND, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  bubbleText: { fontSize: 14, color: '#1A1A18', lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  msgTime: { fontSize: 10, color: '#9B9890', marginTop: 3 },
  locationMsg: { backgroundColor: '#E6F4EE', borderWidth: 1, borderColor: 'rgba(15,92,58,0.2)', borderRadius: 14, padding: 12, maxWidth: '72%' },
  locationTitle: { fontSize: 12, fontWeight: '600', color: BRAND, marginBottom: 2 },
  locationSub: { fontSize: 12, color: '#6B6860' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9B9890', fontSize: 14 },
  quickReplies: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(15,92,58,0.2)' },
  quickChipText: { fontSize: 12, fontWeight: '500', color: BRAND },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, backgroundColor: 'rgba(255,255,255,0.95)' },
  attachBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F2F0EB', justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#F2F0EB', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, color: '#1A1A18', maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },
});
