import { Fragment } from 'react';
import type { TetherHost } from 'tetherkit-core';
import { LaserOverlay } from './LaserOverlay';
import { tokenizeInline, type Slide } from './slides';

function Inline({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((token, i) => {
        switch (token.kind) {
          case 'strong':
            return <strong key={i}>{token.text}</strong>;
          case 'em':
            return <em key={i}>{token.text}</em>;
          case 'code':
            return <code key={i}>{token.text}</code>;
          default:
            return <Fragment key={i}>{token.text}</Fragment>;
        }
      })}
    </>
  );
}

export interface SlidePresenterProps {
  host: TetherHost;
  slides: Slide[];
  index: number;
}

/** 16:9 slide stage with the laser canvas layered on top. */
export function SlidePresenter({ host, slides, index }: SlidePresenterProps) {
  const slide = slides[index];
  return (
    <div className="slides">
      <div className="slides__stage">
        {slide && (
          <article key={index} className={`slide ${index === 0 ? 'slide--title' : ''}`}>
            {slide.kicker && <p className="slide__kicker">{slide.kicker}</p>}
            <h1 className="slide__title">
              <Inline text={slide.title} />
            </h1>
            {slide.lead && (
              <p className="slide__lead">
                <Inline text={slide.lead} />
              </p>
            )}
            {slide.blocks.map((block, i) =>
              block.kind === 'list' ? (
                <ul key={i} className="slide__list">
                  {block.items.map((item, j) => (
                    <li key={j}>
                      <Inline text={item} />
                    </li>
                  ))}
                </ul>
              ) : block.kind === 'code' ? (
                <pre key={i} className="slide__code">
                  <code>{block.text}</code>
                </pre>
              ) : (
                <p key={i} className="slide__p">
                  <Inline text={block.text} />
                </p>
              ),
            )}
            <footer className="slide__footer">
              <span>tether-deck</span>
              <span>
                {index + 1} / {slides.length}
              </span>
            </footer>
          </article>
        )}
        <LaserOverlay host={host} />
      </div>
    </div>
  );
}
