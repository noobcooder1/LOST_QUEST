declare const __LOCAL_MODEL_CONFIG__: {
  vision: {
    feature: { directory: string; source: string; revision: string; label: string; adapter: 'dinov2-cls'; dimensions: number; inputSize: number; dtype: string };
    classifier: { directory: string; source: string; revision: string; label: string; adapter: 'clip-zero-shot'; dtype: string };
  };
};

declare const __ALLOW_REMOTE_MODELS__: boolean;
