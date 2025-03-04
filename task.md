I want to change some features in the project, specifically on the randomizer, 
the way its done now is that there is a single button for the 3 questions to be randomized, but i want that to change, each participant has a category more specifically
Categories:
Categoria A: tem 5 Ajzas 
We would have 2 questions
Subcategorias: 
A1: 1-5 juz
A2: 26-30 juz

Category B: There are 10 Ajzas
We would have 2 questions
B1: 1-10 juz
B2: 20-30 juz

Category C: There are 20 Ajzas
We would have 3 questions
C1: 1-20 juz
C2: 11-30 juz

Category D: There are 30 Ajzas
We would have 4 questions
D1: full Quran 
D2: full Quran

The participant will be assigned a category and the questions will be randomized from the category.

An azja is a set of pages from the Quran. i will provide you with the list of ajzas and the according interval of pages since the way the quran is structured on firestore is by page number.

ajza = juz

Juz'-1 (Pages 1-21)
Juz'-2 (Pages 22-41)
Juz'-3 (Pages 42-61)
Juz'-4 (Pages 62-81)
Juz'-5 (Pages 82-101)
Juz'-6 (Pages 102-121)
Juz'-7 (Pages 122-141)
Juz'-8 (Pages 142-161)
Juz'-9 (Pages 162-181)
Juz'-10 (Pages 182-201)
Juz'-11 (Pages 202-221)
Juz'-12 (Pages 222-241)
Juz'-13 (Pages 242-261)
Juz'-14 (Pages 262-281)
Juz'-15 (Pages 282-301)
Juz'-16 (Pages 302-321)
Juz'-17 (Pages 322-341)
Juz'-18 (Pages 342-361)
Juz'-19 (Pages 362-381)
Juz'-20 (Pages 382-401)
Juz'-21 (Pages 402-421)
Juz'-22 (Pages 422-441)
Juz'-23 (Pages 442-461)
Juz'-24 (Pages 462-481)
Juz'-25 (Pages 482-501)
Juz'-26 (Pages 502-521)
Juz'-27 (Pages 522-541)
Juz'-28 (Pages 542-561) 
Juz'-29 (Pages 562-581)
Juz'-30 (Pages 582-604)

When randomizing the questions, the participant will have a category and the questions will be randomized from the category.

if there are 2 questions, the ajzas will be divided into 2 parts and the first question will be from the first part and the second question will be from the second part.   

if there are 3 questions, the ajzas will be divided into 3 parts and the first question will be from the first part, the second question will be from the second part and the third question will be from the third part.

if there are 4 questions, the ajzas will be divided into 4 parts and the first question will be from the first part, the second question will be from the second part, the third question will be from the third part and the fourth question will be from the fourth part.

Remember that full quran is all ajzas, that means that it would cover all 30 ajzas. It would have to split it into 4 parts like said above.


For example for category A:

A1: 1-5 juz -> this would be the first the pages covering from ajza 1 to 5, for the questions we would have to randomize for question 1 would cover the first 2.5 ajzas and for question 2 would cover the last 2.5 ajzas.
A2: 26-30 juz -> this would be the the pages covering from ajza 26 to 30, for the questions we would have to randomize for question 1 would cover the first 2.5 ajzas and for question 2 would cover the last 2.5 ajzas.

and so forth for the other categories.

And each question will have its own button to randomize the question.

    
    

