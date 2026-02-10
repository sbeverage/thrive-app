// file: app/index.js
import React, { useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Video, ResizeMode } from 'expo-av';
import { VIDEO_ASSETS } from './utils/assetConstants';

const { width } = Dimensions.get('window');

// Supabase Storage Base URL
const SUPABASE_STORAGE_BASE = 'https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/app-assets';

const slides = [
  {
    key: '1',
    title: 'GIVE',
    description: 'Support causes that matter to you through everyday purchases.',
    image: { uri: `${SUPABASE_STORAGE_BASE}/assets/images/slider-image-3.png` },
    video: { uri: VIDEO_ASSETS.GIVE_LOOP }, // Using Supabase URL
  },
  {
    key: '2',
    title: 'SHOP',
    description: 'Discover great deals from local merchants and online retailers.',
    image: { uri: `${SUPABASE_STORAGE_BASE}/assets/images/slider-image-1.png` },
    video: { uri: VIDEO_ASSETS.SHOP_LOOP }, // Using Supabase URL
  },
  {
    key: '3',
    title: 'SAVE',
    description: 'Earn rewards and savings every time you shop.',
    image: { uri: `${SUPABASE_STORAGE_BASE}/assets/images/slider-image-2.png` },
    video: { uri: VIDEO_ASSETS.SAVE_LOOP }, // Using Supabase URL
  },
];

export default function Index() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const videoRefs = useRef([]);
  const [videoLoading, setVideoLoading] = useState({});

  const handleScroll = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const onVideoLoad = (index) => {
    // Video loaded successfully
    console.log(`Video ${index + 1} loaded`);
    setVideoLoading(prev => ({ ...prev, [index]: false }));
  };

  const onVideoError = (index, error) => {
    // Fallback to static image if video fails to load
    console.log(`Video ${index + 1} error:`, error);
    setVideoLoading(prev => ({ ...prev, [index]: false }));
  };

  // Set initial loading state for videos and add timeout fallback
  React.useEffect(() => {
    const initialLoading = {};
    slides.forEach((_, index) => {
      initialLoading[index] = true;
    });
    setVideoLoading(initialLoading);

    // Add timeout fallback to hide loading after 3 seconds
    const timeoutIds = slides.map((_, index) => 
      setTimeout(() => {
        setVideoLoading(prev => ({ ...prev, [index]: false }));
      }, 3000)
    );

    // Cleanup timeouts
    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, []);



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {/* Decorative Half Circles */}
      <Image source={{ uri: `${SUPABASE_STORAGE_BASE}/assets/images/half-circle-left.png` }} style={styles.leftCircle} />
      <Image source={{ uri: `${SUPABASE_STORAGE_BASE}/assets/images/half-circle-right.png` }} style={styles.rightCircle} />

      <Text style={styles.welcomeText}>Welcome to</Text>
      <Image
        source={{ uri: `${SUPABASE_STORAGE_BASE}/assets/logos/initiative-logo-no-web.png` }}
        style={styles.headerLogo}
        resizeMode="contain"
      />
      <Text style={styles.nonprofitText}>501 c3 nonprofit organization</Text>

      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        renderItem={({ item, index }) => (
          <View style={styles.slide}>
            <View style={styles.circleWrapper}>
              {item.video ? (
                <View style={styles.videoContainer}>
                  <Video
                    ref={(ref) => (videoRefs.current[index] = ref)}
                    source={item.video}
                    style={styles.circleVideo}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={true}
                    isLooping={true}
                    isMuted={true}
                    onLoad={() => onVideoLoad(index)}
                    onError={(error) => onVideoError(index, error)}
                    onPlaybackStatusUpdate={(status) => {
                      if (status.isLoaded && status.isPlaying) {
                        // Video is loaded and playing, hide loading
                        setVideoLoading(prev => ({ ...prev, [index]: false }));
                      }
                    }}
                    useNativeControls={false}
                  />
                  {videoLoading[index] && (
                    <View style={styles.videoLoadingOverlay}>
                      <Text style={styles.videoLoadingText}>Loading...</Text>
                    </View>
                  )}
                </View>
              ) : (
                // Fallback to static image if video is not available
                <Image 
                  source={item.image} 
                  style={styles.circleVideo} 
                  resizeMode="contain"
                />
              )}
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideDescription}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.dotsContainer}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.activeDot,
            ]}
          />
        ))}
      </View>

      <View style={styles.buttonsWrapper}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.primaryText}>Sign Up</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.outlineText}>Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 60,
  },
  welcomeText: {
    fontSize: 22,
    color: '#6d6e72',
    marginBottom: 5,
    marginTop: 60,
  },
  headerLogo: {
    width: 310,
    height: 30,
    marginBottom: 8,
  },
  nonprofitText: {
    fontSize: 12,
    color: '#6d6e72',
    marginBottom: 60,
    fontWeight: '400',
  },
  slide: {
    width: width,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  circleWrapper: {
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#DADADA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    marginBottom: 30,
    overflow: 'hidden', // Ensure video stays within circle bounds
  },
      circleVideo: {
      width: 300,
      height: 300,
      borderRadius: 150,
    },
    videoContainer: {
      position: 'relative',
      width: 300,
      height: 300,
      borderRadius: 150,
    },
    videoLoadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 150,
    },
    videoLoadingText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    circleImage: {
      width: 400,
      height: 400,
    },
  slideTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2F4E58',
    marginBottom: 8,
  },
  slideDescription: {
    fontSize: 16,
    color: '#2F4E58',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 5,
  },
  activeDot: {
    backgroundColor: '#2F4E58',
  },
  buttonsWrapper: {
    flexDirection: 'row',
    marginTop: 30,
    marginBottom: 40,
    justifyContent: 'center',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineText: {
    color: '#db8633',
    fontWeight: '600',
    fontSize: 16,
  },
  leftCircle: {
    position: 'absolute',
    top: 80,
    left: -30,
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
  rightCircle: {
    position: 'absolute',
    bottom: 140,
    right: -20,
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
});
