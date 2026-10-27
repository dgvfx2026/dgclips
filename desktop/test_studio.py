"""Regressions for editorial integrity, caption timing and social compositions."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from captions import PRESETS, ass_color, caption_y, flatten_words, make_captions
from editorial import quote_locations, requested_count, select_moments, unique_candidates, validate_candidate, windows
from reframing import filter_plan, rect
from studio_options import validate_options


SEGMENTS = [{'start': i*5, 'end': i*5+4.8, 'text': f'Esta é a ideia completa número {i} sobre aprender com os erros.'} for i in range(36)]
CANDIDATE = dict(start_id=0, end_id=5, title='Aprender com os erros', reason='Uma explicação completa sobre aprendizado.', evidence='sobre aprender com os erros', kind='insight', hook=4, context=4, payoff=4, humor=3, importance=4)


class EditorialTests(unittest.TestCase):
    def test_requested_count_is_not_hardcoded_and_auto_scales(self):
        self.assertEqual(requested_count(17, 1800), 17)
        self.assertEqual(requested_count('auto', 1800), 12)
        self.assertEqual(requested_count('auto', 14400), 30)
        for value in (True, 0, 51, 2.5, '10'):
            with self.assertRaises(ValueError):
                requested_count(value, 600)

    def test_windows_cover_long_video_with_overlap_and_bounds(self):
        segments = SEGMENTS * 3
        segments = [{**s, 'start': i*5, 'end': i*5+4.8} for i,s in enumerate(segments)]
        groups = windows(segments)
        self.assertEqual(set().union(*map(set, groups)), set(range(len(segments))))
        for a,b in zip(groups,groups[1:]):
            self.assertTrue(set(a) & set(b))
            self.assertLess(a[0],b[0])
        self.assertTrue(all(segments[g[-1]]['end']-segments[g[0]]['start'] <= 240 for g in groups))

    def test_candidate_requires_real_evidence_ids_context_and_payoff(self):
        good = validate_candidate(CANDIDATE, list(range(36)), SEGMENTS, 180, 'short', 'balanced')
        self.assertEqual(good['start'],0)
        self.assertLessEqual(good['end'],30.5)
        for field,value in [('start_id',-1),('end_id',99),('start_id',True),('context',2),('payoff',1),('hook',6),('kind','viral'),('evidence','uma fala que não existe')]:
            item = {**CANDIDATE, field:value}
            self.assertIsNone(validate_candidate(item,list(range(36)),SEGMENTS,180,'short','balanced'),field)
        self.assertIsNone(validate_candidate({**CANDIDATE,'humor':2},list(range(36)),SEGMENTS,180,'short','funny'))

    def test_duration_and_subset_are_enforced(self):
        self.assertIsNone(validate_candidate({**CANDIDATE,'end_id':12},list(range(36)),SEGMENTS,180,'short','balanced'))
        self.assertIsNone(validate_candidate(CANDIDATE,[7,8,9],SEGMENTS,180,'short','balanced'))

    def test_quoted_boundaries_are_grounded_and_cannot_escape_the_window(self):
        segments = [{'start':i*5,'end':i*5+4.8,'text':text} for i,text in enumerate(['O começo de uma história real.','Uma ideia bem importante surgiu.','O teste não funcionou no começo.','Tentamos de novo com outra ideia.','Conseguimos encontrar a solução juntos.','Essa foi a conclusão da experiência.'])]
        item = {key:value for key,value in CANDIDATE.items() if key not in {'start_id','end_id'}}
        item.update(opening='O começo de uma história',closing='conclusão da experiência',evidence='encontrar a solução juntos')
        clip = validate_candidate(item,list(range(6)),segments,30,'short','balanced')
        self.assertEqual((clip['start_id'],clip['end_id']),(0,5))
        self.assertIsNone(validate_candidate({**item,'closing':'um final inventado'},list(range(6)),segments,30,'short','balanced'))
        self.assertIsNone(validate_candidate(item,[0,1,2],segments,30,'short','balanced'))
        self.assertEqual(quote_locations('experiência que não existe',list(range(6)),segments),[])

    def test_duplicate_and_overlapping_spans_are_removed(self):
        first = {'start':0,'end':30,'text':'uma história completa com final surpreendente'}
        overlap = {'start':29,'end':55,'text':'outra fala independente sobre tecnologia e ciência'}
        duplicate = {**first,'start':60,'end':90}
        independent = {'start':100,'end':130,'text':'Os exercícios físicos ajudam o corpo humano.'}
        self.assertEqual(unique_candidates([first,overlap,duplicate,independent],10),[first,independent])

    def test_critical_review_may_reject_and_never_falls_back_to_random(self):
        class Runtime:
            assets = {'model':{'name':'test'}}
            acceleration = 'test'
            review = True
            def start(self,*_): pass
            def chat(self,system,prompt,schema,check,**kwargs):
                check()
                review = 'slot' in schema['properties']['clips']['items']['properties']
                return {'clips': [] if review and not self.review else [{**CANDIDATE,**({'slot':0} if review else {})}]}
        runtime = Runtime()
        clips,summary = select_moments(runtime,SEGMENTS,180,{'clip_count':1,'clip_length':'short'},lambda *_:None,lambda:None)
        self.assertEqual(len(clips),1)
        self.assertTrue(summary['reviewed'])
        self.assertTrue(clips[0]['reviewed'])
        runtime.review = False
        with self.assertRaisesRegex(ValueError,'revisão de contexto'):
            select_moments(runtime,SEGMENTS,180,{'clip_count':1,'clip_length':'short'},lambda *_:None,lambda:None)


class CaptionTests(unittest.TestCase):
    def test_word_timestamps_are_clamped_to_clip(self):
        segments = [{'text':'antes agora depois','start':0,'end':8,'words':[{'word':'antes','start':1,'end':3},{'word':'agora','start':3,'end':5},{'word':'depois','start':5,'end':8}]}]
        words = flatten_words(segments,2,6)
        self.assertEqual(words[0]['start'],2)
        self.assertEqual(words[-1]['end'],6)
        self.assertEqual([w['word'] for w in words],['antes','agora','depois'])

    def test_nine_styles_have_distinct_rendering_and_animation(self):
        self.assertEqual(len(PRESETS),9)
        rendered = {p['id']:make_captions(SEGMENTS,0,30,1080,1920,{'caption_template':p['id']}) for p in PRESETS}
        self.assertEqual(len(set(rendered.values())),9)
        self.assertIn(r'\kf',rendered['karaoke'])
        self.assertIn(r'\t(0,100',rendered['word_pop'])
        self.assertIn(r'\1c',rendered['reels'])

    def test_safe_zones_and_color_validation(self):
        self.assertGreater(caption_y(1920,{'layout':'react_top'}),1920*.5)
        self.assertLess(caption_y(1920,{'layout':'react_bottom'}),1920*.5)
        self.assertEqual(caption_y(1920,{'layout':'react_top','caption_position':'seam','camera_share':.4}),768)
        self.assertEqual(ass_color('#123456'),'&H00563412&')
        with self.assertRaises(ValueError): ass_color(r'{\pos(0,0)}')
        self.assertIn('&H00563412&',make_captions(SEGMENTS,0,30,1080,1920,{'caption_template':'default','caption_color':'#123456'}))

    def test_transcript_cannot_inject_ass_commands(self):
        output=make_captions([{'start':0,'end':2,'text':r'{\pos(0,0)} Olá'}],0,2,1080,1920,{'caption_template':'default'})
        self.assertNotIn(r'{\pos(0,0)}',output)


class CompositionTests(unittest.TestCase):
    def test_rectangles_reject_out_of_bounds_and_nonfinite_values(self):
        for value in ({'x':-.1,'y':0,'w':1,'h':1},{'x':.9,'y':0,'w':.2,'h':1},{'x':0,'y':0,'w':float('nan'),'h':1},{'x':0,'y':0,'w':.01,'h':1}):
            with self.assertRaises(ValueError): rect(value)

    def test_react_fills_both_panels_in_correct_order(self):
        options={'layout':'react_top','camera_rect':{'x':.7,'y':.2,'w':.3,'h':.3},'camera_share':.32}
        graph,width,height=filter_plan(1920,1080,options,'clip.ass')
        self.assertEqual((width,height),(1080,1920))
        self.assertIn('[camera][content]vstack=inputs=2',graph)
        self.assertIn('crop=1080:614',graph)
        self.assertIn('crop=1080:1306',graph)
        bottom,*_=filter_plan(1920,1080,{**options,'layout':'react_bottom'})
        self.assertIn('[content][camera]vstack=inputs=2',bottom)

    def test_react_requires_camera_and_preferences_are_validated(self):
        with self.assertRaisesRegex(ValueError,'câmera'):
            validate_options({'layout':'react_top'},require_camera=True)
        for options in ({'clip_count':51},{'camera_share':.9},{'caption_scale':float('inf')},{'caption_template':'unknown'},{'add_subtitles':'true'}):
            with self.assertRaises(ValueError): validate_options(options)
        self.assertEqual(validate_options({'clip_count':20})['clip_count'],20)


if __name__ == '__main__':
    unittest.main()
