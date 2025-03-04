Now that we have the categories and the ajzas implemented and working we need to change the jury page to work as follows:

Each student starts with 100%,

there are 3 sections to be evaluated

1. Hifz which is 60% of the total score ( x questions)
    1.1 Fath / assisted ( each point removes -2 % of the grade)
    1.2 Tannin / reminder ( each point removes -1 % of the grade)
    1.3 Taraddud ( each pont removes -0.5 % of the grade)

2. Tajweed which is 30% of the total score ( x questions)
    2.1 Jali/major ( each point removes -2 % of the grade)
    2.2 Khafi/minor ( each point removes -1 % of the grade)


3. Waqf which is 10% of the total score ( x questions)
    3.1 ibtida ( each point removes -1 % of the grade)

Depending on questions that the participant would have, imagine is its 2 questions, the hifz, tajweed and waqf percentage would be divided into 2 parts, the same for the other sections.
if it was 3 questions, the hifz, tajweed and waqf percentage would be divided into 3 parts and so on.

And at the end of the last question evaluation, the jury will have a the ability to add a geral performance percentage ( Performance/Fluency ) up to 5% which increments with +1 points which will be added to the total score.

The database schema the way it is right now is the following:
DB schema

Jury collection -> jury id x -> currentQuestion, hasFinishedEvalutating, id, name
Participants collection -> participant id -> age, assignedQuestions ( depends on category and randomizer ), category, country, flag, id, isActive, isDone, parentsName,phoneNum, scheduled,school,updatedAt
quran collection -> document 1 to 604 ( all pages of the quran )
scores collection -> participantid_juryid_questionumber -> createdAt, JuryId, participantId, questionNumber, scores -> fluency, hifz_assistance, hifz_reminder, tajweed_major, tajweed_minor , updatedAt 

, and looking at the models.ts file would also be important,

if needed to change the database schema, please let me know.





