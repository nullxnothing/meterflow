import { Component } from "@/components/ui/etheral-shadow";
import { FlickeringFooter } from "@/components/ui/flickering-footer";
import { MorphingText } from "@/components/ui/liquid-text";

const DemoOne = () => {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Component
        color="var(--text-muted)"
        animation={{ scale: 100, speed: 90 }}
        noise={{ opacity: 1, scale: 1.2 }}
        sizing="fill"
      />
    </div>
  );
};

const texts = ["Hello", "Designali", "Text", "Animation", "Design", "Component", "Smooth", "Transition"];

export function MorphingTextDemo() {
  return <MorphingText texts={texts} />;
}

export function FlickeringFooterDemo() {
  return <FlickeringFooter />;
}

export { DemoOne };
