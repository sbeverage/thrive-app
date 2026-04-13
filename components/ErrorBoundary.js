import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import * as Sentry from '@sentry/react-native';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo?.componentStack,
      },
    });
    console.error('🔴 ErrorBoundary caught:', error, errorInfo);
  }

  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          {__DEV__ && this.state.errorInfo?.componentStack ? (
            <ScrollView style={styles.stackScroll}>
              <Text style={styles.stack}>{this.state.errorInfo.componentStack}</Text>
            </ScrollView>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={() => this.handleReset()}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#5D6D7E',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  stackScroll: {
    maxHeight: 180,
    width: '100%',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  stack: {
    fontSize: 11,
    color: '#e74c3c',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
